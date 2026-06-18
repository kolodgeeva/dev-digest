/**
 * GET /repos/:id/pulls → `findings_summary` per-severity counts. The list's
 * findings column derives its badge counts from each PR's LATEST review (the
 * same review the score ring uses), counting ALL findings (dismissed too) so
 * the badge total matches the detail popover. Gated on Docker (needs Postgres).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `findings-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function addPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  repoId: string,
  number: number,
) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number,
      title: `PR ${number}`,
      author: 'octocat',
      branch: `feat/${number}`,
      base: 'main',
      headSha: `sha${number}`,
      additions: 5,
      deletions: 1,
      filesCount: 2,
      status: 'open',
    })
    .returning();
  return pr!;
}

async function addReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  createdAt: Date,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, kind: 'review', score: 70, createdAt })
    .returning();
  return review!;
}

let findingSeq = 0;
async function addFinding(
  db: PgFixture['handle']['db'],
  reviewId: string,
  severity: string,
  opts: { dismissed?: boolean } = {},
) {
  await db.insert(t.findings).values({
    reviewId,
    file: `src/f${findingSeq}.ts`,
    startLine: 1,
    endLine: 1,
    severity,
    category: 'bug',
    title: `Finding ${findingSeq++}`,
    rationale: 'because',
    confidence: 0.9,
    dismissedAt: opts.dismissed ? new Date() : null,
  });
}

d('GET /repos/:id/pulls — findings_summary (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function fetchPulls(repoId: string): Promise<PrMeta[]> {
    // Empty `pulls` so the GitHub sync doesn't overwrite our seeded rows.
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(res.statusCode).toBe(200);
    return res.json() as PrMeta[];
  }

  it('returns per-severity counts from the latest review, including dismissed', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    const review = await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-10T00:00:00Z'));
    await addFinding(pg.handle.db, review.id, 'CRITICAL');
    await addFinding(pg.handle.db, review.id, 'CRITICAL');
    await addFinding(pg.handle.db, review.id, 'WARNING');
    await addFinding(pg.handle.db, review.id, 'SUGGESTION', { dismissed: true });

    const pulls = await fetchPulls(repo.id);
    const got = pulls.find((p) => p.number === 1);
    expect(got?.findings_summary).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it('uses the NEWEST review when a PR has several', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 2);
    const older = await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-01T00:00:00Z'));
    await addFinding(pg.handle.db, older.id, 'CRITICAL');
    await addFinding(pg.handle.db, older.id, 'CRITICAL');
    const newer = await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-15T00:00:00Z'));
    await addFinding(pg.handle.db, newer.id, 'WARNING');

    const pulls = await fetchPulls(repo.id);
    const got = pulls.find((p) => p.number === 2);
    expect(got?.findings_summary).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
  });

  it('is null for an unreviewed PR and for a review with no findings', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const unreviewed = await addPr(pg.handle.db, workspaceId, repo.id, 3);
    const reviewedEmpty = await addPr(pg.handle.db, workspaceId, repo.id, 4);
    await addReview(pg.handle.db, workspaceId, reviewedEmpty.id, new Date('2026-06-10T00:00:00Z'));

    const pulls = await fetchPulls(repo.id);
    expect(pulls.find((p) => p.number === 3)?.findings_summary ?? null).toBeNull();
    expect(pulls.find((p) => p.number === 4)?.findings_summary ?? null).toBeNull();
  });
});
