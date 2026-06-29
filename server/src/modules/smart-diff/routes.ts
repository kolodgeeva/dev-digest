import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module routes.
 *   GET /pulls/:id/smart-diff → risk-ordered file groups + split suggestion.
 *
 * Deterministic composition of pr_files (available right after PR import) and
 * the latest review's findings (present only after the first Run Review).
 * Makes NO LLM call — free by tokens.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.build(workspaceId, req.params.id);
  });
}
