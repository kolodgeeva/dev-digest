import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, Skill, SkillType } from '@devdigest/shared';
import { ValidationError, NotFoundError } from '../../platform/errors.js';
import { resolveAvailableLlm } from '../settings/feature-models.js';
import { toSkillDto } from '../skills/helpers.js';
import { ConventionsRepository } from './repository.js';
import { toConventionDto, groundCandidates, assembleSkillBody } from './helpers.js';
import {
  ConventionFileSelection,
  ConventionExtraction,
  FILE_SELECTION_SCHEMA,
  EXTRACTION_SCHEMA,
  buildFileSelectionMessages,
  buildExtractionMessages,
} from './schemas.js';
import { CONVENTION_SAMPLE_SIZE, CONVENTION_READ_LIMIT } from './constants.js';

/**
 * Conventions service — the repo-house-rules extractor. Two-step LLM dialogue
 * (file selection → extraction) over a code-gathered sample, a grounding gate
 * that drops candidates not backed by a real file+snippet, accept/reject/edit
 * triage, and merging accepted candidates into a `source: 'extracted'` Skill
 * (optionally linked to an agent) via the existing Skills Lab plumbing.
 */

export interface CreateConventionSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
  agentId?: string;
}

export interface ConventionSkillDraft {
  name: string;
  description: string;
  body: string;
}

export interface UpdateConventionInput {
  rule?: string;
  evidenceSnippet?: string;
  accepted?: boolean;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  /**
   * List a repo's conventions by `owner/name` full name (the MCP get_conventions
   * tool speaks by name). Throws NotFoundError with actionable text if unknown.
   */
  async listByRepoFullName(
    workspaceId: string,
    repoFullName: string,
  ): Promise<ConventionCandidate[]> {
    const repoId = await this.repo.findRepoIdByFullName(workspaceId, repoFullName);
    if (!repoId) throw new NotFoundError(`Repo "${repoFullName}" not imported`);
    return this.list(workspaceId, repoId);
  }

  /**
   * Run the extraction pipeline and persist the grounded candidates (replacing the
   * repo's prior pending rows; accepted rows are kept). Returns the fresh candidates.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    // Resolve to a provider whose key is actually configured (falls back from the
    // registry default provider to any other configured one) — not a hard openai dep.
    const { llm, model } = await resolveAvailableLlm(this.container, workspaceId, 'conventions');

    // 1. Code-only sample of the most representative source files.
    const samplePaths = await this.container.repoIntel.getConventionSamples(
      repoId,
      CONVENTION_SAMPLE_SIZE,
    );
    if (samplePaths.length === 0) {
      // No ranked source files — the repo isn't indexed (or repo-intel is off), so
      // there's nothing to scan. Surface it instead of silently returning empty.
      throw new ValidationError(
        'No source files to scan yet. Sync and index this repo first (the repo shows ' +
          '"not synced"), then re-run extraction.',
      );
    }

    // 2. Model narrows the sample to the files worth reading in full.
    const selection = await llm.completeStructured<ConventionFileSelection>({
      model,
      schema: ConventionFileSelection,
      schemaName: FILE_SELECTION_SCHEMA,
      messages: buildFileSelectionMessages(samplePaths, CONVENTION_READ_LIMIT),
    });
    const allowed = new Set(samplePaths);
    const chosen = selection.data.files.filter((f) => allowed.has(f)).slice(0, CONVENTION_READ_LIMIT);
    const toRead = chosen.length > 0 ? chosen : samplePaths.slice(0, CONVENTION_READ_LIMIT);

    // 3. Read the real file contents from the clone.
    const files = await this.container.repoIntel.readSampleFiles(repoId, toRead);
    if (files.length === 0) {
      // Ranked paths exist but the clone can't be read — repo isn't cloned locally.
      throw new ValidationError(
        'Could not read the repo clone. Sync the repo so it is cloned locally, then ' +
          're-run extraction.',
      );
    }

    // 4. Model extracts candidate conventions from the real contents.
    const extraction = await llm.completeStructured<ConventionExtraction>({
      model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA,
      messages: buildExtractionMessages(files),
    });

    // 5. Grounding gate — keep only candidates whose snippet is in the read files.
    const grounded = groundCandidates(extraction.data.candidates, files);

    // 6. Persist (replace pending) and return.
    const rows = await this.repo.replacePending(
      workspaceId,
      repoId,
      grounded.map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet,
        confidence: c.confidence,
      })),
    );
    return rows.map(toConventionDto);
  }

  /** Accept / inline-edit a candidate. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.evidenceSnippet !== undefined ? { evidenceSnippet: patch.evidenceSnippet } : {}),
      ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
    });
    return row ? toConventionDto(row) : undefined;
  }

  /** Reject a candidate (removes it). */
  async reject(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Default name/description/body for the "Create skill from conventions" modal. */
  async draftSkill(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const accepted = (await this.repo.listAccepted(workspaceId, repoId)).map(toConventionDto);
    const name = (await this.repo.repoName(repoId)) ?? 'repo';
    return {
      name: `${name}-conventions`,
      description: `${accepted.length} house conventions extracted from ${name}`,
      body: assembleSkillBody(accepted, name),
    };
  }

  /**
   * Create the merged skill from the repo's accepted candidates. Inserts via the
   * skills repository as `source: 'extracted'` (the public SkillsService.create
   * hardcodes 'manual'), recording the cited paths in `evidence_files`. When
   * `agentId` is provided, links the new skill to that agent (appended last).
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillInput,
  ): Promise<Skill> {
    const accepted = (await this.repo.listAccepted(workspaceId, repoId)).map(toConventionDto);
    const evidenceFiles = [...new Set(accepted.map((c) => c.evidence_path).filter(Boolean))];

    const row = await this.container.skillsRepo.insert({
      workspaceId,
      name: input.name,
      type: input.type ?? 'convention',
      source: 'extracted',
      body: input.body,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(evidenceFiles.length > 0 ? { evidenceFiles } : {}),
    });
    const skill = toSkillDto(row);

    if (input.agentId) {
      const agent = await this.container.agentsRepo.getById(workspaceId, input.agentId);
      if (agent) {
        const links = await this.container.agentsRepo.linkedSkills(input.agentId);
        await this.container.agentsRepo.linkSkill(input.agentId, skill.id, links.length);
      }
    }
    return skill;
  }
}
