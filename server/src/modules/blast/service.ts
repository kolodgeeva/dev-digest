import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastResponse, type BlastResponse } from './helpers.js';

/**
 * BlastService — orchestrate the PR blast-radius use case.
 *
 * Layering: routes.ts → BlastService → container.reviewRepo + container.repoIntel.
 * No Drizzle here. No LLM import — blast is FREE by tokens (zero model calls).
 * All DB access goes through container.reviewRepo; all index reads through
 * container.repoIntel. This is the "zero-LLM guarantee".
 */
export class BlastService {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.reviewRepo;
  }

  /**
   * build — resolve a blast radius by internal PR id.
   *
   * Used by GET /pulls/:id/blast (internal id from UI).
   */
  async build(workspaceId: string, prId: string): Promise<BlastResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.repo.getPrFiles(prId);
    const result = await this.container.repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );

    return toBlastResponse(result);
  }

  /**
   * buildByRef — resolve a blast radius by repo full name + PR number.
   *
   * Used by GET /blast?repo=owner/name&pr=N (MCP / external callers).
   */
  async buildByRef(workspaceId: string, repo: string, pr: number): Promise<BlastResponse> {
    const repoRow = await this.repo.findRepoByFullName(workspaceId, repo);
    if (!repoRow) throw new NotFoundError(`Repo "${repo}" not imported`);

    const pullRef = await this.repo.findPullByRepoAndNumber(workspaceId, repoRow.id, pr);
    if (!pullRef) throw new NotFoundError(`PR #${pr} not found in "${repo}"`);

    const files = await this.repo.getPrFiles(pullRef.prId);
    const result = await this.container.repoIntel.getBlastRadius(
      repoRow.id,
      files.map((f) => f.path),
    );

    return toBlastResponse(result);
  }
}
