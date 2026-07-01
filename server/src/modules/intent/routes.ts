import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Intent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module routes.
 *   GET  /pulls/:id/intent           → read stored intent (or null)
 *   POST /pulls/:id/intent/recompute → classify + persist + return intent + savings
 *
 * The POST response uses an inline Zod schema so the vendored contracts stay
 * untouched (same pattern as conventions/routes.ts).
 */

const RecomputeResponse = z.object({
  intent: Intent,
  token_savings: z.object({
    full_diff_tokens: z.number().int(),
    classifier_tokens: z.number().int(),
    saved: z.number().int(),
  }),
});

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  // ---- Read stored intent (no LLM call) ------------------------------------
  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const intent = await service.get(workspaceId, req.params.id);
    return intent; // null → 200 with null body; client handles empty state
  });

  // ---- Recompute intent (LLM call; tight rate limit) -----------------------
  app.post(
    '/pulls/:id/intent/recompute',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.recompute(workspaceId, req.params.id, req.log);
      return RecomputeResponse.parse(result);
    },
  );
}
