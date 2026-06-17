# INSIGHTS — server (@devdigest/api)

Append-only notes the previous session leaves for the next, scoped to the Fastify
API. Maintained by the `engineering-insights` skill — see
`.claude/skills/engineering-insights/SKILL.md`.

**How to use:** don't overwrite; correct a stale entry with a dated note referencing
the old one. Each entry: `YYYY-MM-DD · category · insight · evidence (file:line)`.
Write it actionable and "cold" — readable with zero session context.

**Maintenance:** prune fixed/obsolete entries monthly; resolve contradictions
explicitly; split into domain files (e.g. `INSIGHTS-db.md`) past ~200 entries. This
is a draft under human spot-check — committed to git.

## What Works
<!-- approaches & solutions that worked -->

## What Doesn't Work
<!-- dead ends & antipatterns — the most-skipped, most-valuable section; fill it -->

## Codebase Patterns
<!-- conventions, architectural decisions -->
- 2026-06-17 · codebase-pattern · Per-run LLM cost is ALREADY computed inside reviewer-core — `ReviewOutcome.costUsd` (`reviewer-core/src/review/run.ts:110,184`; OpenRouter's API `cost`, else `estimateCost` fallback). To surface cost, just persist `outcome.costUsd`; never recompute via the model/pricing again (zero extra calls). `run-executor.ts:213` destructures it; `estimateCost`/`price-book` already wired in the container.
- 2026-06-17 · codebase-pattern · PR-list per-PR aggregates (score, cost_usd) are computed ON READ, not denormalized. `pulls/routes.ts` (~line 120) builds `latestReviewByPr` from the `reviews` table ordered newest-first, first-seen-per-PR wins. cost lives on `agent_runs` (not `reviews`), so it's a `leftJoin(agentRuns, eq(agentRuns.id, reviews.runId))`. Mirror this map to add any new latest-review-derived list field.
- 2026-06-17 · codebase-pattern · CORRECTION of the entry above re cost_usd: PR-list `cost_usd` is NOT the latest-review run cost — it's the SUM of every agent run for that PR (across all agents, all time). Built in `pulls/routes.ts` as a separate `costByPr` map: `select({ prId, cost: sql\`sum(${agentRuns.costUsd})\` }).from(agentRuns).where(inArray(prId, prIds)).groupBy(prId)`. `score` still comes from `latestReviewByPr`. `sum()` over double-precision returns `number|null` (null when all rows unpriced → renders "—"). Two independent queries now, not one join.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->

## Recurring Errors & Fixes
<!-- repeated error + its fix -->
- 2026-06-17 · gotcha · Adding a field to a shared Zod contract as `z.number().nullable()` makes the KEY REQUIRED (nullable ≠ optional) — every `Contract.parse({...})` fixture missing it throws "Required". When touching RunStats/RunSummary/etc., grep fixtures and update them: `server/test/contracts.test.ts`, plus client `RunTraceDrawer.test.tsx` / `RunHistory.test.tsx`. Use `.nullish()` instead if the key should be optional (that's what PrMeta.score/cost_usd use).

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
