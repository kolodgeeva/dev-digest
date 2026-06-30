import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RunRequest } from '@devdigest/shared';
import type { RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { RunBus } from '../../platform/sse.js';
import { ReviewService } from './service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → run review(s); returns runs
 *   POST   /reviews/run-sync  {repo,pr,agent}          → create→wait→collect; one MCP-friendly call
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /runs/:id/outcome                           → concise RunOutcomeDto (verdict + findings)
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;

/** `/reviews/run-sync` body — the MCP write tool speaks owner/name + PR number. */
const RunSyncBody = z.object({
  repo: z.string().min(1),
  pr: z.number().int().positive(),
  agent: z.string().min(1),
});

/**
 * Max time `/reviews/run-sync` blocks on `runBus.onDone` before falling back to
 * `{ status:'running', run_id }`. The synchronous wait lives here (not in the
 * MCP process) because the in-memory `runBus` only exists in the API process.
 */
const RUN_SYNC_TIMEOUT_MS = (() => {
  const n = Number(process.env.MCP_RUN_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
})();

/** Resolve when the run completes, or `true` if `timeoutMs` elapses first. */
function waitForDone(runBus: RunBus, runId: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      resolve(timedOut);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    const off = runBus.onDone(runId, () => finish(false));
  });
}

export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // Body stays a tolerant manual parse (both fields optional; empty body is OK).
  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = RunRequest.parse(req.body ?? {});
    const targets = await service.resolveTargets(workspaceId, {
      ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
      ...(body.all !== undefined ? { all: body.all } : {}),
    });
    const { runs, reviews } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews };
  });

  // ---- Synchronous review (MCP) — create → wait → collect in one call ------
  // The MCP `run_agent_on_pr` tool maps 1:1 to this: resolve owner/name + PR
  // number → run a single agent → block on the in-process runBus until done
  // (capped) → return the concise outcome. Same fan-out cost as the manual
  // trigger, so the same tight rate limit applies.
  app.post(
    '/reviews/run-sync',
    { schema: { body: RunSyncBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { repo, pr, agent } = req.body;

      // Resolve agent + PR with actionable 404s — the MCP client passes the
      // message straight through to the AI tool-caller (errors lead onward).
      const targets = await service.resolveTargets(workspaceId, { agentId: agent }).catch(() => {
        throw new NotFoundError(
          `agent "${agent}" not found — call list_agents to get a valid agent id`,
        );
      });
      const { prId } = await service.resolvePullRef(workspaceId, repo, pr).catch(() => {
        throw new NotFoundError(
          `repo "${repo}" PR #${pr} isn't imported yet — add the repo and sync its PRs in the studio first`,
        );
      });

      const { runs } = await service.runReview(workspaceId, prId, targets, req.log);
      const runId = runs[0]?.run_id;
      if (!runId) throw new NotFoundError('Failed to start a review run');

      const timedOut = await waitForDone(container.runBus, runId, RUN_SYNC_TIMEOUT_MS);
      if (timedOut) return { status: 'running' as const, run_id: runId };

      const outcome = await service.runOutcome(workspaceId, runId);
      if (!outcome) throw new NotFoundError(`Run ${runId} produced no outcome`);
      return outcome;
    },
  );

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    await getContext(container, req);
    const runId = req.params.id;

    reply.sse(
      (async function* () {
        // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
        const queue: RunEvent[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        const unsubscribe = container.runBus.subscribe(runId, (e) => {
          queue.push(e);
          resolve?.();
        });
        const offDone = container.runBus.onDone(runId, () => {
          done = true;
          resolve?.();
        });

        try {
          while (true) {
            if (queue.length === 0) {
              if (done) break;
              await new Promise<void>((r) => (resolve = r));
              resolve = null;
              continue;
            }
            const e = queue.shift()!;
            yield {
              id: String(e.seq),
              event: e.kind,
              data: JSON.stringify(e),
            };
          }
        } finally {
          unsubscribe();
          offDone();
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Concise run outcome by run id (MCP get_findings) -------------------
  app.get('/runs/:id/outcome', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const outcome = await service.runOutcome(workspaceId, req.params.id);
    if (!outcome) {
      throw new NotFoundError(
        `Run "${req.params.id}" not found — run an agent first with run_agent_on_pr`,
      );
    }
    return outcome;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(`/findings/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
    });
  }
}
