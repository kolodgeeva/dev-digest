import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { Container } from '../src/platform/container.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { NotFoundError } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[mcp-http] Docker not available — skipping integration tests.');
}

/**
 * The HTTP surface the MCP server (R8) consumes, plus the service seams beneath
 * it. The 3 new routes are exercised with `app.inject` against a real Postgres;
 * the seams are also called directly. No LLM, no network — the read paths build
 * no provider and the secrets stub guarantees it.
 */
d('mcp http surface', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let svc: ReviewService;
  let workspaceId: string;
  let repoFullName: string;
  let repoId: string;
  let prNumber: number;
  let prId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { secrets: { get: async () => undefined } },
    });
    const container = new Container(config, pg.handle.db, { secrets: { get: async () => undefined } });
    svc = new ReviewService(container);

    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoFullName = repo!.fullName;
    repoId = repo!.id;
    const [pull] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo!.id));
    prNumber = pull!.number;
    prId = pull!.id;
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  // ---- service seams (no HTTP) --------------------------------------------

  it('resolveRepoId resolves a known repo and rejects an unknown one', async () => {
    await expect(svc.resolveRepoId(workspaceId, repoFullName)).resolves.toEqual(expect.any(String));
    await expect(svc.resolveRepoId(workspaceId, 'ghost/missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('resolvePullRef resolves a known PR and rejects an unknown number', async () => {
    const ref = await svc.resolvePullRef(workspaceId, repoFullName, prNumber);
    expect(ref).toEqual({ prId, repoId: expect.any(String) });
    await expect(svc.resolvePullRef(workspaceId, repoFullName, 999999)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  // ---- GET /runs/:id/outcome ----------------------------------------------

  it('GET /runs/:id/outcome returns the concise verdict + findings of a completed run', async () => {
    // Seed a completed run + its review + one finding directly (no executor).
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, status: 'done', source: 'local' })
      .returning({ id: t.agentRuns.id });
    const runId = run!.id;
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: null,
        runId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'One blocking issue.',
        score: 60,
        model: 'mock-model',
      })
      .returning({ id: t.reviews.id });
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/api/users.ts',
      startLine: 10,
      endLine: 12,
      severity: 'CRITICAL',
      category: 'security',
      title: 'SQL injection',
      rationale: 'Unparameterized query.',
      suggestion: 'Use a parameterized query.',
      confidence: 0.9,
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/outcome` });
    expect(res.statusCode).toBe(200);
    const outcome = res.json();
    expect(outcome).toMatchObject({
      run_id: runId,
      status: 'done',
      verdict: 'request_changes',
      score: 60,
      summary: 'One blocking issue.',
    });
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      file: 'src/api/users.ts',
      start_line: 10,
      end_line: 12,
      severity: 'CRITICAL',
      title: 'SQL injection',
    });
  });

  it('GET /runs/:id/outcome 404s for an unknown run id (actionable)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/runs/00000000-0000-0000-0000-000000000000/outcome',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/run_agent_on_pr/);
  });

  // ---- GET /conventions?repo= ---------------------------------------------

  it('GET /conventions?repo= returns the repo conventions by full name', async () => {
    await pg.handle.db.insert(t.conventions).values({
      workspaceId,
      repoId,
      rule: 'Use parameterized queries',
      evidencePath: 'src/db.ts',
      evidenceSnippet: 'db.query(sql`...`)',
      confidence: 0.9,
      accepted: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/conventions?repo=${encodeURIComponent(repoFullName)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.repo).toBe(repoFullName);
    expect(body.conventions.length).toBeGreaterThanOrEqual(1);
    expect(body.conventions[0]).toMatchObject({ rule: expect.any(String) });
  });

  it('GET /conventions?repo= 404s for an unimported repo', async () => {
    const res = await app.inject({ method: 'GET', url: '/conventions?repo=ghost/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/not imported/);
  });

  // ---- POST /reviews/run-sync (error paths lead onward) -------------------

  it('POST /reviews/run-sync 404s with an actionable message for an unknown agent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reviews/run-sync',
      payload: { repo: repoFullName, pr: prNumber, agent: 'does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/list_agents/);
  });

  it('POST /reviews/run-sync 404s with an actionable message for an unimported repo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reviews/run-sync',
      payload: { repo: 'ghost/missing', pr: 1, agent: agentId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/isn.t imported/);
  });
});
