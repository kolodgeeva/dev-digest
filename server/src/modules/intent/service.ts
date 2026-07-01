import type { Container } from '../../platform/container.js';
import { Intent } from '@devdigest/shared';
import { resolveAvailableLlm } from '../settings/feature-models.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  INTENT_SCHEMA,
  extractHunkHeaders,
  extractReferencedPaths,
  buildIntentMessages,
  approxTokens,
} from './schemas.js';

/** Minimal structured logger (pino-compatible) for intent logs. */
interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface IntentRecomputeResult {
  intent: Intent;
  token_savings: {
    full_diff_tokens: number;
    classifier_tokens: number;
    saved: number;
  };
}

/**
 * IntentService — read and (re)compute the PR intent classification.
 *
 * Layering: routes.ts → IntentService → (ReviewRepository + loadDiff + resolveAvailableLlm).
 * No Drizzle in this file — all DB access via ReviewRepository.
 */
export class IntentService {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.reviewRepo;
  }

  /**
   * Read the stored intent for a PR. Returns null when no intent has been
   * classified yet — the client uses this to trigger an auto-recompute.
   */
  async get(_workspaceId: string, prId: string): Promise<Intent | null> {
    const intent = await this.repo.getIntent(prId);
    return intent ?? null;
  }

  /**
   * Classify the intent for a PR from hunk headers + best-effort references
   * (linked issue, in-repo specs), persist it, and return the result with a
   * token-savings summary.
   *
   * Never throws for missing references (each resolution is best-effort). The
   * review pipeline must NEVER be blocked by intent computation.
   */
  async recompute(
    workspaceId: string,
    prId: string,
    log: Logger,
  ): Promise<IntentRecomputeResult> {
    // ---- Load PR + repo rows -----------------------------------------------
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new Error(`Pull request not found: ${prId}`);

    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new Error(`Repo not found for PR: ${prId}`);

    // ---- Load unified diff -------------------------------------------------
    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repoRow);
    const fileHeaders = extractHunkHeaders(diff);
    const fullDiffTokens = approxTokens(diff.raw);

    // ---- Reference resolution (ALL best-effort) ----------------------------

    // 1. Linked issue — via GitHub API (already allowed: CLAUDE.md network policy).
    let linkedIssue: { number: number; title: string; body?: string | null } | null = null;
    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest(
        { owner: repoRow.owner, name: repoRow.name },
        pull.number,
      );
      if (detail.linked_issue) {
        linkedIssue = {
          number: detail.linked_issue.number,
          title: detail.linked_issue.title,
          body: detail.linked_issue.body,
        };
      }
    } catch (err) {
      log.warn({ prId, err: (err as Error).message }, 'intent: linked issue resolution failed (best-effort)');
    }

    // 2. In-repo spec / plan files referenced in the PR body (local clone only, no network).
    const refPaths = extractReferencedPaths(pull.body);
    const MAX_FILE_CHARS = 4_000;
    const MAX_TOTAL_CHARS = 12_000;
    const specs: { path: string; content: string }[] = [];
    let totalSpecChars = 0;

    for (const refPath of refPaths) {
      if (totalSpecChars >= MAX_TOTAL_CHARS) break;
      try {
        const content = await this.container.git.readFile(
          { owner: repoRow.owner, name: repoRow.name },
          refPath,
        );
        if (!content) continue;
        const capped = content.slice(0, MAX_FILE_CHARS);
        totalSpecChars += capped.length;
        specs.push({ path: refPath, content: capped });
      } catch {
        // File missing or clone unavailable — skip silently (best-effort).
      }
    }

    // ---- Build messages + call LLM -----------------------------------------
    const messages = buildIntentMessages({
      title: pull.title,
      body: pull.body,
      linkedIssue,
      specs,
      files: fileHeaders,
    });

    const { llm, model } = await resolveAvailableLlm(this.container, workspaceId, 'review_intent');
    const result = await llm.completeStructured<Intent>({
      model,
      schema: Intent,
      schemaName: INTENT_SCHEMA,
      messages,
    });

    // ---- Persist ------------------------------------------------------------
    await this.repo.upsertIntent(prId, result.data);

    // ---- Token-savings log -------------------------------------------------
    const classifierTokensIn = result.tokensIn;
    const saved = fullDiffTokens - classifierTokensIn;
    const ratio = fullDiffTokens > 0 ? +(saved / fullDiffTokens).toFixed(3) : 0;
    const resolvedRefs = [
      ...(linkedIssue ? [`issue #${linkedIssue.number}`] : []),
      ...specs.map((s) => s.path),
    ];

    log.info(
      { prId, fullDiffTokens, classifierTokensIn, saved, ratio, resolvedRefs },
      'intent: classified from hunk-headers only',
    );

    return {
      intent: result.data,
      token_savings: {
        full_diff_tokens: fullDiffTokens,
        classifier_tokens: classifierTokensIn,
        saved,
      },
    };
  }
}
