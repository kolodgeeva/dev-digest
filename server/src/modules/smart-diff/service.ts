import type { Container } from '../../platform/container.js';
import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './classify.js';

/**
 * SmartDiffService — read pr_files + the latest review's findings and compose
 * them into the `SmartDiff` contract.
 *
 * Layering: routes.ts → SmartDiffService → container.reviewRepo (the ONLY DB
 * access). No Drizzle here. Critically: NO LLM import — Smart Diff makes no
 * model call (the expensive call already happened in the Structured Reviewer),
 * so the feature is free by tokens.
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.reviewRepo;
  }

  async build(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.repo.getPrFiles(prId);

    // reviewsForPull is newest-first → [0] is the latest review. Before any
    // review runs there are no findings, so the grouping still works with
    // empty finding_lines (no overlay).
    const reviews = await this.repo.reviewsForPull(prId);
    const findings = (reviews[0]?.findings ?? []).map((f) => ({
      file: f.file,
      start_line: f.startLine,
    }));

    return buildSmartDiff(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
      findings,
    );
  }
}
