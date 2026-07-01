import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[mcp-http] Docker not available — skipping integration tests.');
}

/**
 * `GET /runs/:id/outcome` — the concise run outcome the MCP server polls after
 * starting a review through `POST /pulls/:id/review`. The MCP no longer has any
 * bespoke aggregate endpoint; it orchestrates general-purpose, id-keyed routes.
 * No LLM, no network — the read path builds no provider and the secrets stub
 * guarantees it.
 */
d('run outcome (polled by the MCP server)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { secrets: { get: async () => undefined } },
    });

    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    const [pull] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo!.id));
    prId = pull!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

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
});
