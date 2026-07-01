/**
 * GET /pulls/:id/blast and GET /blast — blast radius mapped from the repo-intel
 * engine, served deterministically with ZERO LLM calls.
 *
 * Gated on Docker (needs Postgres).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import type { BlastResponse } from '../src/modules/blast/helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A rich BlastResult fixture: ≥2 callers across ≥1 endpoint. */
const BLAST_FIXTURE: BlastResult = {
  changedSymbols: [
    { file: 'src/auth/verifyToken.ts', name: 'verifyToken', kind: 'function' },
    { file: 'src/users/getUser.ts', name: 'getUser', kind: 'function' },
  ],
  callers: [
    { file: 'src/routes/login.ts', symbol: 'handleLogin', viaSymbol: 'verifyToken', line: 42, rank: 1 },
    { file: 'src/routes/profile.ts', symbol: 'getProfile', viaSymbol: 'verifyToken', line: 17, rank: 2 },
    { file: 'src/services/account.ts', symbol: 'getAccount', viaSymbol: 'getUser', line: 8, rank: 1 },
  ],
  impactedEndpoints: ['POST /api/login', 'GET /api/profile'],
  factsByFile: {
    'src/routes/login.ts': { endpoints: ['POST /api/login'], crons: [] },
    'src/routes/profile.ts': { endpoints: ['GET /api/profile'], crons: [] },
    'src/services/account.ts': { endpoints: [], crons: [] },
  },
  degraded: false,
  reason: undefined,
};

/** A degraded BlastResult fixture (no factsByFile). */
const DEGRADED_FIXTURE: BlastResult = {
  ...BLAST_FIXTURE,
  factsByFile: undefined,
  degraded: true,
  reason: 'index_partial',
};

/**
 * Stub RepoIntel — only getBlastRadius is called by the blast module.
 * Cast via `as unknown as RepoIntel` to avoid implementing the full interface.
 */
function makeRepoIntelStub(result: BlastResult): RepoIntel {
  return {
    getBlastRadius: async () => result,
  } as unknown as RepoIntel;
}

let repoSeq = 0;

async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${repoSeq++}`;
  const fullName = `acme/${name}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName })
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
      additions: 50,
      deletions: 10,
      filesCount: 2,
      status: 'open',
    })
    .returning();
  return pr!;
}

async function addFiles(
  db: PgFixture['handle']['db'],
  prId: string,
  paths: string[],
) {
  await db.insert(t.prFiles).values(
    paths.map((path) => ({ prId, path, patch: null, additions: 10, deletions: 2 })),
  );
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  async function fetchBlast(prId: string, fixtureResult = BLAST_FIXTURE) {
    const gh = new MockGitHubClient({ pulls: [] });
    const llm = new MockLLMProvider('openai');
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: gh,
        llm: { openai: llm, anthropic: new MockLLMProvider('anthropic') },
        secrets: { get: async () => undefined },
        repoIntel: makeRepoIntelStub(fixtureResult),
      },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    return { res, body: res.json() as BlastResponse, llm };
  }

  it('returns the mapped blast envelope with ≥2 callers and ≥1 endpoint, zero LLM calls', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 1);
    await addFiles(pg.handle.db, pr.id, ['src/auth/verifyToken.ts', 'src/users/getUser.ts']);

    const { res, body, llm } = await fetchBlast(pr.id);
    expect(res.statusCode).toBe(200);

    // ≥2 callers total
    const totalCallers = body.downstream.flatMap((d) => d.callers).length;
    expect(totalCallers).toBeGreaterThanOrEqual(2);

    // ≥1 endpoint
    const totalEndpoints = new Set(body.downstream.flatMap((d) => d.endpoints_affected));
    expect(totalEndpoints.size).toBeGreaterThanOrEqual(1);

    // Envelope shape
    expect(body.changed_symbols).toBeDefined();
    expect(Array.isArray(body.downstream)).toBe(true);
    expect(typeof body.summary).toBe('string');
    expect(typeof body.degraded).toBe('boolean');
    expect(body.degraded).toBe(false);
    expect(body.reason).toBeNull();

    // Zero LLM calls — the deterministic guarantee
    expect(llm.calls).toHaveLength(0);
  });

  it('returns 404 for an unknown PR id', async () => {
    const { res } = await fetchBlast('00000000-0000-0000-0000-000000000000');
    expect(res.statusCode).toBe(404);
  });

  it('passes through degraded flag when fixture is degraded', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 2);
    await addFiles(pg.handle.db, pr.id, ['src/auth/verifyToken.ts']);

    const { res, body } = await fetchBlast(pr.id, DEGRADED_FIXTURE);
    expect(res.statusCode).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('index_partial');
  });
});

d('GET /blast?repo=&pr= (by ref)', () => {
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

  async function fetchBlastByRef(repo: string, pr: number, fixtureResult = BLAST_FIXTURE) {
    const gh = new MockGitHubClient({ pulls: [] });
    const llm = new MockLLMProvider('openai');
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: gh,
        llm: { openai: llm, anthropic: new MockLLMProvider('anthropic') },
        secrets: { get: async () => undefined },
        repoIntel: makeRepoIntelStub(fixtureResult),
      },
    });
    const url = `/blast?repo=${encodeURIComponent(repo)}&pr=${pr}`;
    const res = await app.inject({ method: 'GET', url });
    return { res, body: res.json() as BlastResponse };
  }

  it('returns the same shape as the by-id route', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const pr = await addPr(pg.handle.db, workspaceId, repo.id, 10);
    await addFiles(pg.handle.db, pr.id, ['src/auth/verifyToken.ts']);

    const { res, body } = await fetchBlastByRef(repo.fullName, 10);
    expect(res.statusCode).toBe(200);
    expect(body.changed_symbols).toBeDefined();
    expect(Array.isArray(body.downstream)).toBe(true);
    expect(typeof body.summary).toBe('string');
    expect(typeof body.degraded).toBe('boolean');
  });

  it('returns 404 for an unknown repo', async () => {
    const { res } = await fetchBlastByRef('nobody/nonexistent-repo', 1);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an unknown PR number', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    // Do NOT add a PR with number 9999
    const { res } = await fetchBlastByRef(repo.fullName, 9999);
    expect(res.statusCode).toBe(404);
  });
});
