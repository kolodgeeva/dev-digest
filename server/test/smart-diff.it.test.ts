/**
 * GET /pulls/:id/smart-diff → risk-ordered file groups + split suggestion,
 * composed deterministically from pr_files + the latest review's findings.
 *
 * Asserts the feature is FREE by tokens: an injected LLM mock records ZERO
 * calls across the request. Gated on Docker (needs Postgres).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smartdiff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function addPr(db: PgFixture['handle']['db'], workspaceId: string, repoId: string, number: number) {
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
      additions: 100,
      deletions: 10,
      filesCount: 3,
      status: 'open',
    })
    .returning();
  return pr!;
}

async function addFiles(
  db: PgFixture['handle']['db'],
  prId: string,
  files: { path: string; additions: number; deletions: number }[],
) {
  await db.insert(t.prFiles).values(files.map((f) => ({ prId, patch: null, ...f })));
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function fetchSmartDiff(prId: string) {
    // Inject an LLM mock + offline secrets so any accidental model call is
    // both recorded AND offline — the assertion below proves zero calls.
    llm = new MockLLMProvider('openai');
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: gh,
        llm: { openai: llm, anthropic: new MockLLMProvider('anthropic') },
        secrets: { get: async () => undefined },
      },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    return { res, body: res.json() as SmartDiff };
  }

  it('groups by role, puts the lock-file in boilerplate, and makes NO LLM call', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    await addFiles(pg.handle.db, pr.id, [
      { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { path: 'src/api/public/index.ts', additions: 12, deletions: 2 },
      { path: 'package-lock.json', additions: 92, deletions: 24 },
    ]);

    const { res, body } = await fetchSmartDiff(pr.id);
    expect(res.statusCode).toBe(200);

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    const boilerplate = body.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.map((f) => f.path)).toEqual(['package-lock.json']);

    // Free by tokens.
    expect(llm.calls).toHaveLength(0);
  });

  it('overlays finding_lines from the latest review', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 2);
    await addFiles(pg.handle.db, pr.id, [
      { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    ]);
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', score: 40, createdAt: new Date() })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      { reviewId: review!.id, file: 'src/api/public/webhooks.ts', startLine: 73, endLine: 73, severity: 'CRITICAL', category: 'security', title: 'SSRF', rationale: 'x', confidence: 0.9 },
      { reviewId: review!.id, file: 'src/api/public/webhooks.ts', startLine: 61, endLine: 61, severity: 'CRITICAL', category: 'security', title: 'token leak', rationale: 'x', confidence: 0.9 },
    ]);

    const { body } = await fetchSmartDiff(pr.id);
    const file = body.groups.flatMap((g) => g.files).find((f) => f.path === 'src/api/public/webhooks.ts')!;
    expect(file.finding_lines).toEqual([61, 73]);
    expect(llm.calls).toHaveLength(0);
  });

  it('returns empty finding_lines before any review', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 3);
    await addFiles(pg.handle.db, pr.id, [
      { path: 'src/users/service.ts', additions: 7, deletions: 2 },
    ]);

    const { body } = await fetchSmartDiff(pr.id);
    const all = body.groups.flatMap((g) => g.files);
    expect(all).toHaveLength(1);
    expect(all[0]!.finding_lines).toEqual([]);
  });

  it('404s for an unknown PR id', async () => {
    const { res } = await fetchSmartDiff('00000000-0000-0000-0000-000000000000');
    expect(res.statusCode).toBe(404);
  });
});
