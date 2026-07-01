import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast module routes.
 *   GET /pulls/:id/blast     → blast radius for a PR (by internal id)
 *   GET /blast               → blast radius for a PR (by repo full name + PR number)
 *
 * Deterministic: reads the repo-intel index already built at clone time.
 * Makes NO LLM call — free by tokens.
 *
 * The response is an inline envelope (BlastRadius from @devdigest/shared + degraded/reason),
 * following the same pattern as intent/routes.ts (inline Zod schema + .parse()).
 */

/** Inline response envelope — BlastRadius vendored contract + degraded signal. */
const BlastResponseSchema = BlastRadius.extend({
  degraded: z.boolean(),
  reason: z.string().nullable(),
});

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  // ---- By internal PR id (UI) ----------------------------------------------
  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.build(workspaceId, req.params.id);
    return BlastResponseSchema.parse(result);
  });

  // ---- By repo full name + PR number (MCP / external) ----------------------
  app.get(
    '/blast',
    {
      schema: {
        querystring: z.object({
          repo: z.string().min(1),
          pr: z.coerce.number().int().positive(),
        }),
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.buildByRef(workspaceId, req.query.repo, req.query.pr);
      return BlastResponseSchema.parse(result);
    },
  );
}
