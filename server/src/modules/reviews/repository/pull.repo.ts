import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

/**
 * Resolve a repo id from its `owner/name` full name (workspace-scoped). Mirrors
 * `repos/repository.ts#findByFullName`, but lives here so the MCP server can
 * resolve refs through the reviews module without cross-module DB coupling.
 */
export async function findRepoByFullName(
  db: Db,
  workspaceId: string,
  fullName: string,
): Promise<{ id: string } | undefined> {
  const [row] = await db
    .select({ id: t.repos.id })
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
  return row;
}

/** Resolve a PR id from a repo id + PR number (workspace-scoped). */
export async function findPullByRepoAndNumber(
  db: Db,
  workspaceId: string,
  repoId: string,
  number: number,
): Promise<{ prId: string } | undefined> {
  const [row] = await db
    .select({ id: t.pullRequests.id })
    .from(t.pullRequests)
    .where(
      and(
        eq(t.pullRequests.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
        eq(t.pullRequests.number, number),
      ),
    );
  return row ? { prId: row.id } : undefined;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}
