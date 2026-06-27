import type { Container } from '../../platform/container.js';
import type { CommunitySkill, Skill, SkillType } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, deriveSkillName } from './helpers.js';
import { COMMUNITY_CATALOG } from './constants.js';

/**
 * A1 — skills service. Business logic for the Skills page + Skill Editor and the
 * import paths (local markdown file + the seeded community catalog).
 *
 * A skill is reusable review text shared across agents — no tool access, only a
 * name + markdown body + type + source. Bodies are versioned in the repository.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Create a user-authored skill (source: 'manual'). */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      source: 'manual',
      body: input.body,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  // ---- Import ---------------------------------------------------------------

  /** The read-only community catalog cards (search/preview happen client-side). */
  catalog(): CommunitySkill[] {
    return COMMUNITY_CATALOG.map((e) => e.card);
  }

  /**
   * Import a catalog entry as a real skill (source: 'community'). Returns
   * undefined when no catalog entry matches `catalogId` (route → 404). Community
   * bodies are delimiter-wrapped as untrusted when injected into a review prompt.
   */
  async importFromCatalog(workspaceId: string, catalogId: string): Promise<Skill | undefined> {
    // Match by stable id or by card name — the catalog card (vendored
    // `CommunitySkill`) has no id field, so the client imports by name.
    const entry = COMMUNITY_CATALOG.find((e) => e.id === catalogId || e.card.name === catalogId);
    if (!entry) return undefined;
    const row = await this.repo.insert({
      workspaceId,
      name: entry.card.name,
      description: entry.card.desc,
      type: entry.type,
      source: 'community',
      body: entry.body,
    });
    return toSkillDto(row);
  }

  /**
   * Import a skill from an uploaded markdown file's contents (source:
   * 'imported_url'). The name is the provided one, or derived from the body's H1
   * / first line. Imported bodies are delimiter-wrapped as untrusted on inject.
   */
  async importFromMarkdown(
    workspaceId: string,
    input: { name?: string; body: string; type?: SkillType },
  ): Promise<Skill> {
    const name = (input.name?.trim() || deriveSkillName(input.body) || 'Imported skill').slice(
      0,
      120,
    );
    const row = await this.repo.insert({
      workspaceId,
      name,
      type: input.type ?? 'custom',
      source: 'imported_url',
      body: input.body,
    });
    return toSkillDto(row);
  }
}
