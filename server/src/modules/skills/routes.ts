import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * A1 — skills module. Reusable, user-editable review text shared across agents.
 *   GET    /skills              → list (workspace-scoped)
 *   GET    /skills/catalog      → seeded community catalog cards
 *   GET    /skills/:id          → one skill
 *   POST   /skills              → create (source: manual)
 *   PUT    /skills/:id          → update / toggle enabled (body change versions)
 *   DELETE /skills/:id          → delete (cascades versions + agent links)
 *   POST   /skills/import       → import from catalog ({catalog_id}) or markdown ({body})
 *
 * Static paths (/skills/catalog, /skills/import) are registered alongside the
 * parametric /skills/:id; Fastify's router prioritizes static matches.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

/** Import a catalog entry (`catalog_id`) OR a markdown body (`body`). */
const ImportSkillBody = z
  .object({
    catalog_id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    type: SkillType.optional(),
  })
  .refine((b) => b.catalog_id !== undefined || b.body !== undefined, {
    message: 'Provide catalog_id (import from catalog) or body (import from markdown)',
  });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/catalog', async (req) => {
    await getContext(app.container, req);
    return service.catalog();
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      type: body.type,
      body: body.body,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post('/skills/import', { schema: { body: ImportSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill =
      body.catalog_id !== undefined
        ? await service.importFromCatalog(workspaceId, body.catalog_id)
        : await service.importFromMarkdown(workspaceId, {
            body: body.body!,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.type !== undefined ? { type: body.type } : {}),
          });
    if (!skill) throw new NotFoundError('Catalog skill not found');
    reply.status(201);
    return skill;
  });
}
