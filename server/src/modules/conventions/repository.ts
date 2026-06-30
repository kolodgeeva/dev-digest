import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns the `conventions` table — extracted house-rule
 * candidates, each grounded in a file + snippet, awaiting accept/reject. Workspace-
 * scoped throughout. Accepted candidates are merged into a Skill by the service.
 */

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
  accepted?: boolean;
}

export interface UpdateConvention {
  rule?: string;
  evidenceSnippet?: string;
  accepted?: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, true),
        ),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Replace a repo's PENDING candidates (accepted = false) with a fresh batch,
   * leaving already-accepted rows intact as history. Returns the inserted rows.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<ConventionRow[]> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, false),
        ),
      );
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          repoId: r.repoId,
          rule: r.rule,
          evidencePath: r.evidencePath,
          evidenceSnippet: r.evidenceSnippet,
          confidence: r.confidence,
          accepted: r.accepted ?? false,
        })),
      )
      .returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidenceSnippet !== undefined ? { evidenceSnippet: patch.evidenceSnippet } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Resolve an internal repo id from its `owner/name` full name (workspace-scoped). */
  async findRepoIdByFullName(workspaceId: string, fullName: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row?.id;
  }

  /** The repo's short display name (for skill naming), or undefined if missing. */
  async repoName(repoId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.name;
  }

  /** Reject a candidate by removing it. Returns false when nothing was deleted. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
