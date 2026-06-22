import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + import, end-to-end over a real Postgres. Covers: create (manual),
 * list, single-fetch, a body edit bumping the version + snapshotting it, a
 * metadata-only edit NOT bumping, delete, import-from-catalog (source: community),
 * import-from-markdown (name derived, source: imported_url), and workspace scoping.
 */
d('skills routes', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'pr-quality-rubric',
    type: 'rubric' as const,
    body: '# Rubric\nFlag missing tests.',
  };

  it('creates a manual skill at v1, then lists + fetches it', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'pr-quality-rubric', source: 'manual', version: 1, enabled: true });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { id: string }[]).some((s) => s.id === skill.id)).toBe(true);

    const one = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toBe(createBody.body);
    await app.close();
  });

  it('a body edit bumps the version + snapshots it; metadata-only edits do not', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const renamed = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { name: 'renamed' } });
    expect(renamed.json().version).toBe(1); // metadata-only → no bump

    const edited = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: '# Rubric\nNow stricter.' } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().version).toBe(2);

    const snapshots = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(snapshots.map((s) => s.version).sort()).toEqual([1, 2]);
    await app.close();
  });

  it('toggling enabled persists without bumping the version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;
    const toggled = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(toggled.json()).toMatchObject({ enabled: false, version: 1 });
    await app.close();
  });

  it('deletes a skill (404 thereafter)', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('imports from the seeded community catalog (source: community)', async () => {
    const app = await makeApp();
    const catalog = await app.inject({ method: 'GET', url: '/skills/catalog' });
    expect(catalog.statusCode).toBe(200);
    const cards = catalog.json() as { name: string }[];
    expect(cards.length).toBeGreaterThan(0);

    const imported = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { catalog_id: cards[0]!.name },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ name: cards[0]!.name, source: 'community' });
    expect((imported.json().body as string).length).toBeGreaterThan(0);

    const ghost = await app.inject({ method: 'POST', url: '/skills/import', payload: { catalog_id: 'nope' } });
    expect(ghost.statusCode).toBe(404);
    await app.close();
  });

  it('imports from markdown, deriving the name from the H1 (source: imported_url)', async () => {
    const app = await makeApp();
    const imported = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { body: '# Imported gate\nDo not leak secrets.' },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ name: 'Imported gate', source: 'imported_url', type: 'custom' });

    const rejected = await app.inject({ method: 'POST', url: '/skills/import', payload: {} });
    expect(rejected.statusCode).toBe(422); // neither catalog_id nor body
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      type: 'custom',
      source: 'manual',
      body: 'secret',
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.delete(defaultWs!, foreign.id)).toBe(false);
  });
});
