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
- 2026-06-17 · solution · Route IT tests live in `server/test/*.it.test.ts` (NOT under `src/`; `vitest.config.ts` includes `test/**`). Pattern (copy `test/pulls-comments.it.test.ts`): `const d = (await dockerAvailable()) ? describe : describe.skip` to gate on Docker; `startPg()` (`test/helpers/pg.ts`) spins pgvector + runs migrations; `seed(db)` then read the first workspace for its id; build the app per-test with `buildApp({ config, db, overrides: { github: gh } })` and drive it via `app.inject({ method, url })`. For list/detail routes that sync from GitHub on read, pass `new MockGitHubClient({ pulls: [] })` so the sync doesn't overwrite your hand-seeded rows. Example: `test/pulls-findings-summary.it.test.ts`.

## What Doesn't Work
<!-- dead ends & antipatterns — the most-skipped, most-valuable section; fill it -->

## Codebase Patterns
<!-- conventions, architectural decisions -->
- 2026-06-17 · codebase-pattern · Per-run LLM cost is ALREADY computed inside reviewer-core — `ReviewOutcome.costUsd` (`reviewer-core/src/review/run.ts:110,184`; OpenRouter's API `cost`, else `estimateCost` fallback). To surface cost, just persist `outcome.costUsd`; never recompute via the model/pricing again (zero extra calls). `run-executor.ts:213` destructures it; `estimateCost`/`price-book` already wired in the container.
- 2026-06-17 · codebase-pattern · PR-list per-PR aggregates (score, cost_usd) are computed ON READ, not denormalized. `pulls/routes.ts` (~line 120) builds `latestReviewByPr` from the `reviews` table ordered newest-first, first-seen-per-PR wins. cost lives on `agent_runs` (not `reviews`), so it's a `leftJoin(agentRuns, eq(agentRuns.id, reviews.runId))`. Mirror this map to add any new latest-review-derived list field.
- 2026-06-17 · codebase-pattern · CORRECTION of the entry above re cost_usd: PR-list `cost_usd` is NOT the latest-review run cost — it's the SUM of every agent run for that PR (across all agents, all time). Built in `pulls/routes.ts` as a separate `costByPr` map: `select({ prId, cost: sql\`sum(${agentRuns.costUsd})\` }).from(agentRuns).where(inArray(prId, prIds)).groupBy(prId)`. `score` still comes from `latestReviewByPr`. `sum()` over double-precision returns `number|null` (null when all rows unpriced → renders "—"). Two independent queries now, not one join.
- 2026-06-17 · codebase-pattern · PR-list `findings_summary` ({CRITICAL,WARNING,SUGGESTION}|null on PrMeta) is derived from each PR's LATEST review (consistent with `score`), in `pulls/routes.ts`: extend `latestReviewByPr` to also capture the review `id`, invert it to a `reviewId→prId` map, then ONE grouped query `select({ reviewId, severity, count: sql\`count(*)\` }).from(findings).where(inArray(reviewId, latestReviewIds)).groupBy(reviewId, severity)`. Count ALL findings (do NOT exclude `dismissedAt`) so the badge total matches the detail popover's "N findings". Set `findings_summary: findingsByPr.get(r.id) ?? null` — null for unreviewed PRs AND for a latest review with zero findings. `findings.severity` is a free `text` column, so guard the three known values before indexing the counts object.
- 2026-06-21 · codebase-pattern · The backend onion layering is now machine-enforced — run `pnpm lint:arch` (`server/.dependency-cruiser.cjs`) before committing module changes; CI should too. Layer map per `modules/<name>/`: `routes.ts`=presentation (Zod+getContext, calls one service), `service.ts`=application (calls repo+ports, no Drizzle), `types/constants/helpers.ts`=domain (pure, no Fastify/Drizzle/adapters), `repository.ts`/`repository/*.repo.ts`=the ONLY place Drizzle/`db/*` lives. Port INTERFACES live in `@devdigest/shared` (LLMProvider, GitClient…); `adapters/*` implement them; `platform/container.ts` is the composition root (allowed to import everything). ERROR rules (break build): repo→routes/service, service→Drizzle, domain→Fastify/Drizzle/adapters, cross-module `modules/a`→`modules/b`. Reference clean module = `modules/agents/`. Full rationale in `.claude/skills/onion-architecture/`.
- 2026-06-21 · what-doesnt-work · Known onion-layer DEBT flagged as `warn` by `pnpm lint:arch` (don't add more; fix when you touch them): DB-in-route — `settings/workspace/polling/pulls` `routes.ts` import `drizzle-orm`+`db/schema` directly instead of going through a service; `repos/service.ts` imports a sibling module's `repo-intel/constants.ts` (cross-module coupling — promote to `_shared`); `repos/helpers.ts` reaches into `db/schema` for a row type (`typeof t.repos.$inferSelect`) — prefer a type from `db/rows.ts`.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->
- 2026-06-21 · tool-note · dependency-cruiser classifies `import * as t from '../../db/schema.js'` as a RUNTIME dependency even when `t` is used only in type position (`typeof t.repos.$inferSelect`), and `to.dependencyTypesNot: ['type-only']` does NOT suppress it (only `import type`/`import { type X }` are tagged type-only). So a layering rule that must tolerate type-only row-shape references can't rely on `dependencyTypesNot` — instead split the rule by target (e.g. `db/schema` at `warn`, `fastify|drizzle-orm|adapters` at `error`). Config: `server/.dependency-cruiser.cjs`; needs `options.tsConfig.fileName: 'tsconfig.json'` to resolve `@devdigest/*` path aliases.

## Recurring Errors & Fixes
<!-- repeated error + its fix -->
- 2026-06-17 · gotcha · Adding a field to a shared Zod contract as `z.number().nullable()` makes the KEY REQUIRED (nullable ≠ optional) — every `Contract.parse({...})` fixture missing it throws "Required". When touching RunStats/RunSummary/etc., grep fixtures and update them: `server/test/contracts.test.ts`, plus client `RunTraceDrawer.test.tsx` / `RunHistory.test.tsx`. Use `.nullish()` instead if the key should be optional (that's what PrMeta.score/cost_usd use).

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
