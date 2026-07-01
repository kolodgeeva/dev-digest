import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract a repo's house-rules, triage them, and merge the
 * accepted ones into a Skill.
 *   POST   /repos/:id/conventions/extract       → run the 2-step extraction pipeline
 *   GET    /repos/:id/conventions               → list persisted candidates
 *   PATCH  /conventions/:id                     → accept / inline-edit
 *   DELETE /conventions/:id                     → reject (remove)
 *   POST   /repos/:id/conventions/skill/draft   → default skill name/description/body
 *   POST   /repos/:id/conventions/skill         → create skill from accepted candidates
 *
 * The `:id` on /repos/:id is the repo; on /conventions/:id it is the candidate.
 */

const UpdateConventionBody = z.object({
  accepted: z.boolean().optional(),
  rule: z.string().min(1).optional(),
  evidence_snippet: z.string().min(1).optional(),
});

const CreateConventionSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  agent_id: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const updated = await service.update(workspaceId, req.params.id, {
        ...(body.accepted !== undefined ? { accepted: body.accepted } : {}),
        ...(body.rule !== undefined ? { rule: body.rule } : {}),
        ...(body.evidence_snippet !== undefined ? { evidenceSnippet: body.evidence_snippet } : {}),
      });
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.reject(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { ok: true };
  });

  app.post('/repos/:id/conventions/skill/draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.draftSkill(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.createSkill(workspaceId, req.params.id, {
        name: body.name,
        body: body.body,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.agent_id !== undefined ? { agentId: body.agent_id } : {}),
      });
      reply.status(201);
      return skill;
    },
  );
}
