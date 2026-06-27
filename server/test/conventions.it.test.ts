import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import type { ConventionCandidate } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions extractor end-to-end over a real Postgres. Drives the 2-step LLM
 * dialogue with a MockLLMProvider keyed by schemaName, a mock RepoIntel for the
 * sample + clone reads, and asserts: grounding drops an ungrounded candidate,
 * accept/reject/edit persist, and createSkill writes a source:'extracted' skill
 * (with evidence_files) linked to an agent.
 */

const FILE = {
  path: 'src/api/users.ts',
  content: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
};

// The mock RepoIntel only needs the two methods the extractor calls.
const repoIntel = {
  getConventionSamples: async () => [FILE.path, 'src/lib/redis.ts'],
  readSampleFiles: async () => [FILE],
} as unknown as RepoIntel;

// Step-1 picks the file; step-2 returns one grounded + one hallucinated candidate.
const structuredBySchema = {
  ConventionFileSelection: { files: [FILE.path] },
  ConventionExtraction: {
    candidates: [
      {
        category: 'style',
        rule: 'Always use async/await instead of .then() chains',
        evidence_path: FILE.path,
        evidence_snippet: 'const user = await db.users.find(id);',
        confidence: 0.91,
      },
      {
        category: 'style',
        rule: 'Hallucinated rule with no real evidence',
        evidence_path: FILE.path,
        evidence_snippet: 'const totallyMadeUp = quantum.entangle();',
        confidence: 0.8,
      },
    ],
  },
};

d('conventions extractor', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        repoIntel,
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema }) },
      },
    });
  }

  it('extracts, grounding drops the hallucinated candidate', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(200);
    const candidates = res.json() as ConventionCandidate[];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.rule).toContain('async/await');
    expect(candidates[0]!.accepted).toBe(false);

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect((list.json() as ConventionCandidate[]).length).toBe(1);
    await app.close();
  });

  it('returns 422 with an actionable message when the repo has no sampled files', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        // Unindexed/not-synced repo: no ranked source files to scan.
        repoIntel: { getConventionSamples: async () => [] } as unknown as RepoIntel,
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema }) },
      },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/sync/i);
    await app.close();
  });

  it('falls back to a configured non-default provider when openai has no key', async () => {
    // Registry default for conventions is openai, but only anthropic is wired here
    // (mirrors a user who configured an Anthropic key but not OpenAI). The secrets
    // stub reports NO openai/openrouter key so the build throws deterministically
    // (no real key file read, no network) and resolution falls back to anthropic.
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        repoIntel,
        secrets: { get: async () => undefined },
        llm: { anthropic: new MockLLMProvider('anthropic', { structuredBySchema }) },
      },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as ConventionCandidate[])).toHaveLength(1);
    await app.close();
  });

  it('accept + inline-edit + reject via PATCH/DELETE', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [c] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` }).then((r) =>
      r.json(),
    )) as ConventionCandidate[];

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${c!.id}`,
      payload: { accepted: true, rule: 'Use async/await' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ accepted: true, rule: 'Use async/await' });

    const rejected = await app.inject({ method: 'DELETE', url: `/conventions/${c!.id}` });
    expect(rejected.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect((after.json() as ConventionCandidate[]).length).toBe(0);
    await app.close();
  });

  it('re-extract replaces pending but keeps accepted rows', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [c] = (await app
      .inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      .then((r) => r.json())) as ConventionCandidate[];
    await app.inject({ method: 'PATCH', url: `/conventions/${c!.id}`, payload: { accepted: true } });

    // Re-extract: the accepted row survives, a fresh pending row is added.
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app
      .inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      .then((r) => r.json())) as ConventionCandidate[];
    expect(list.filter((x) => x.accepted)).toHaveLength(1);
    expect(list.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it('creates a source:extracted skill from accepted candidates, linked to an agent', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [c] = (await app
      .inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      .then((r) => r.json())) as ConventionCandidate[];
    await app.inject({ method: 'PATCH', url: `/conventions/${c!.id}`, payload: { accepted: true } });

    const draft = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/draft`,
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().body).toContain('# payments-api-conventions');

    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'payments-api-conventions', body: draft.json().body, agent_id: agent!.id },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ source: 'extracted', type: 'convention' });
    expect(skill.evidence_files).toContain(FILE.path);

    // The skill is linked to the agent.
    const agentsRepo = new AgentsRepository(pg.handle.db);
    const links = await agentsRepo.linkedSkills(agent!.id);
    expect(links.some((l) => l.skill.id === skill.id)).toBe(true);
    await app.close();
  });
});
