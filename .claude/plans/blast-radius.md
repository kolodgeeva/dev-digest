# Blast Radius — PR impact map (changed symbols → callers → endpoints)

## Context

A reviewer's first question on any PR is *"what can these changes break?"* — and the diff
alone doesn't answer it. **Blast Radius** answers it by surfacing, for a PR: the symbols
declared in the changed files, who calls them downstream (with a clickable `file:line`), and
which HTTP endpoints are reachable from those files.

The defining constraint (from the feature brief): **almost no AI, and no analysis at review
time.** Everything is read from the `repo-intel` index that is already built at clone time.
Research confirmed the engine is **already implemented** — `container.repoIntel.getBlastRadius()`
returns exactly this data from Postgres with zero LLM calls. The contract `BlastRadius` is
**already vendored** in both apps, and the client `blast.json` i18n namespace **already has
keys**. So this is a *surfacing* task: one server route, a `BlastResult → BlastRadius` mapping,
and an Overview panel — no migration, no new shared contract, no model call.

**Decided scope:** Overview panel (per mockup, beside INTENT) · Tree view only (Graph toggle
renders the existing `graph.empty` placeholder) · deterministic `summary` (zero LLM).

## What already exists (reuse — do NOT recreate)

- **Engine:** `RepoIntel.getBlastRadius(repoId, changedFiles): Promise<BlastResult>` —
  `server/src/modules/repo-intel/service.ts:220` (persistent Postgres path `tryPersistentBlast`,
  `service.ts:315`). `BlastResult` type at `repo-intel/types.ts:74`:
  `{ changedSymbols, callers: BlastCallerRow[], impactedEndpoints, factsByFile?, degraded?, reason? }`.
  Mockable in tests via `ContainerOverrides.repoIntel`.
- **Completeness signal:** `RepoIntel.getIndexState(repoId)` — never throws; the persistent blast
  path already self-degrades (`degraded: true, reason`) when the index is missing/partial.
- **Shared contract (pre-scaffolded, do-not-touch `vendor/`):** `BlastRadius`, `ChangedSymbol`,
  `BlastCaller {name,file,line}`, `DownstreamImpact {symbol, callers[], endpoints_affected[], crons_affected[]}`
  — `server/src/vendor/shared/contracts/brief.ts:16` and the identical `client/` copy, exported
  from `@devdigest/shared`.
- **Changed files + tenancy gate:** `container.reviewRepo.getPull(workspaceId, prId)` and
  `getPrFiles(prId)` (used verbatim by `smart-diff`).
- **Client:** `blast.json` namespace already has `stat.{symbols,callers,endpoints,crons}`,
  `view.{tree,graph}`, `callerCount`, `noDownstream`, `graph.empty`; `brief.json` has `block.blast`.
  Single locale (`en`) only — no multi-locale work. `IntentCard` is the panel template;
  `githubBlobUrl` + `MonoLink` are the clickable-`file:line` primitives; `Chip`/`Badge`/`Skeleton`/
  `SectionLabel`/`EmptyState` cover the rest.

## Server — new module `server/src/modules/blast/`

Mirror `smart-diff` exactly (deterministic, token-free; service touches only the container, never
Drizzle — that absence is the "free by tokens" guarantee).

- **`routes.ts`** — `GET /pulls/:id/blast`, `{ schema: { params: IdParams } }`, `getContext` →
  `workspaceId`, returns `service.build(workspaceId, req.params.id)`. The response is an **inline
  envelope** (Zod `z.object` defined in this file, like `intent`'s `RecomputeResponse`) =
  `BlastRadius` **plus** `{ degraded: boolean, reason: string | null }`, since the vendored
  `BlastRadius` has no degraded field and `vendor/` is do-not-touch.
- **`service.ts`** — `BlastService.build(workspaceId, prId)`:
  1. `pull = reviewRepo.getPull(workspaceId, prId)`; `throw new NotFoundError('Pull request not found')` if missing (tenancy gate).
  2. `files = reviewRepo.getPrFiles(prId)`.
  3. `result = container.repoIntel.getBlastRadius(pull.repoId, files.map(f => f.path))`.
  4. `return toBlastResponse(result)` — pure mapper.
- **`helpers.ts`** (pure domain — no Fastify/Drizzle) — `toBlastResponse(result: BlastResult)`:
  - `changed_symbols` ← `result.changedSymbols` (`{name, file, kind}`).
  - `downstream[]` ← **group `result.callers` by the changed symbol they hit**
    (`caller.viaSymbol ?? caller.symbol` matched to a `changedSymbols[].name`); each
    `DownstreamImpact` = `{ symbol, callers: [{name: caller.symbol, file, line}], endpoints_affected, crons_affected }`,
    where endpoints/crons are attributed via `result.factsByFile[callerFile]` (fall back to the flat
    `result.impactedEndpoints` when `factsByFile` is absent — degraded path).
  - `summary` ← deterministic template, e.g. `"N symbols changed · M downstream callers across K files · P endpoints impacted"` (zero LLM).
  - `degraded`/`reason` ← passthrough from `result`.
- **Register** the module: one import + entry in `server/src/modules/index.ts` (a `blast` slot is
  already namedropped in its comments).

**Architecture check:** `pnpm lint:arch` must stay green — service reaches data only through
`container.reviewRepo` / `container.repoIntel` (the composition root), never `new XRepository()` or
a sibling module's folder (avoids `no-cross-module-coupling`); `helpers.ts` stays pure.

## Client — Blast panel in the Overview tab

- **`client/src/lib/hooks/blast.ts`** — `useBlast(prId)` mirroring `useIntent` (treat 404 as
  empty): `queryKey: ["blast", prId]`, `api.get<BlastResponse>(\`/pulls/${prId}/blast\`)`,
  `enabled: !!prId`. Export from `hooks/index.ts`. (Type the envelope locally in the hook file
  since it extends the shared `BlastRadius`.)
- **`_components/BlastCard/`** (template = `IntentCard`): `<section>` + `<SectionLabel icon=... right={Tree/Graph Chips}>{t('block.blast')}</SectionLabel>`; `Skeleton` group while loading.
  - **Summary chips** (`Chip` with trailing `count`): symbols / callers / endpoints / crons from `stat.*`.
  - **Tree:** changed symbol → its `downstream.callers` rendered as `MonoLink` `file:line` via
    `githubBlobUrl(repoFullName, headSha, file, line)` → impacted `endpoints_affected` chips.
    `noDownstream` when a symbol has no callers.
  - **Graph toggle:** `Chip` pair; Graph view renders the existing `graph.empty` placeholder (stub).
  - **Degraded/empty:** when `degraded` → `Badge dot color="var(--warn)"` + explanatory line (add
    `blast.degraded` / `blast.degradedHint` keys); when the index has no data → `EmptyState` (never a blank panel).
- **Wire into Overview:** `OverviewTab` currently receives only `{ prBody, prId }`. Thread
  `repoFullName` (`activeRepo.full_name`) and `headSha` (`pr.head_sha`) — both already in
  `usePrDetailPage`/`page.tsx` — down to `BlastCard` for the GitHub links. Lay it out beside
  `IntentCard` per the mockup. Add `invalidateQueries(["blast", prId])` to `onRunDone` in
  `usePrDetailPage.ts` (next to the existing `smart-diff` invalidation).
- **i18n:** add only the 2 degraded keys to `client/messages/en/blast.json`; everything else exists.

## Tests

- **Server unit** (`blast/helpers.test.ts`): `toBlastResponse` — grouping by changed symbol,
  endpoint/cron attribution from `factsByFile`, deterministic summary, degraded passthrough.
- **Server IT** (`server/test/blast.it.test.ts`, gated on Docker like `smart-diff.it.test.ts`):
  inject `overrides.repoIntel` returning a fixture `BlastResult` + `overrides.secrets = { get: async () => undefined }` (proves **zero LLM** — assert no provider built); drive `GET /pulls/:id/blast`
  via `app.inject`; assert the mapped envelope, the **≥2 callers / ≥1 endpoint** shape from the
  acceptance criteria, a 404 for an unknown PR, and the degraded flag when the fixture is `degraded`.
- **Client** (RTL): `useBlast` (404→null) and `BlastCard` — tree renders, caller link href is a
  correct `githubBlobUrl`, empty/degraded/no-downstream branches.

## Verification (end-to-end)

1. `./scripts/dev.sh` (Postgres + API + web). Ensure a repo is imported so its repo-intel index
   builds at clone time (`GET /repos/:id/index-state` shows `full`/`partial`).
2. Open a **demo PR that changes a shared helper**; on the Overview tab the BLAST RADIUS panel shows
   ≥2 callers and ≥1 endpoint (matches the mockup).
3. **Click a caller `file:line`** → opens the correct GitHub blob at that line.
4. **Zero model calls:** open the run/agent logs — only index reads, no parse/LLM events; the IT
   test's `secrets: undefined` override is the automated proof.
5. **Empty/degraded:** point at a repo with no index → panel shows the degraded badge / EmptyState,
   not a blank screen.
6. `pnpm -C server typecheck && pnpm -C server lint:arch && pnpm -C server test` and
   `pnpm -C client typecheck && pnpm -C client test`.

## Deliverables (acceptance criteria)

- This plan in the repo at `.claude/plans/blast-radius.md` (per project rule: plans live in the
  repo), **plus** a short feature doc (e.g. `server/src/modules/blast/README.md` or a `docs/` page)
  — satisfies "both markdown documents exist".
- An open PR describing what was done + a demo video showing a caller click → code jump.

## File ownership (parallel slices — non-overlapping)

Three implementers can run in parallel; each owns a disjoint file set. The shared response
envelope is the contract between them: `BlastRadius` (from `@devdigest/shared`) **plus**
`{ degraded: boolean, reason: string | null }`, served by `GET /pulls/:id/blast` and
`GET /blast?repo=owner/name&pr=N`. Slices B and C code against this documented shape, so they
do not need slice A merged first.

- **Slice A — Backend** (owns: `server/src/modules/blast/**`, `server/src/modules/index.ts`,
  `server/test/blast.it.test.ts`): the `blast/` module (`helpers.ts`, `service.ts`, `routes.ts`),
  module registration, unit test, IT test. `service.build` (by prId, internal) **and**
  `service.buildByRef(workspaceId, repo, pr)` (by owner/name + number, for the MCP route) — the
  latter resolves via `container.reviewRepo.findRepoByFullName` + `findPullByRepoAndNumber`
  (already on the repo facade). Both routes live in `blast/routes.ts`.
- **Slice B — MCP** (owns: `mcp-server/src/deps.ts`, `mcp-server/src/http-client.ts`,
  `mcp-server/src/contracts/tools.ts`, `mcp-server/src/tools/get-blast-radius.ts`,
  `mcp-server/src/tools/__tests__/{get-blast-radius.test.ts,fixtures.ts}`): add
  `getBlastRadius(repo, pr)` to `ToolDeps` + `http-client` (`GET /blast?repo=&pr=`), rewrite the
  stub tool to call it and map to a widened `getBlastRadiusOutput` (loosen `status` off
  `z.literal('not_implemented')` → `z.enum(['ok','degraded'])`; objects for `changed_symbols` +
  grouped `downstream` + flat `impacted_endpoints` union + `summary`/`degraded`/`reason`). Update
  the tool test + `makeDeps` fixture.
- **Slice C — Client** (owns: `client/src/lib/hooks/blast.ts`, `client/src/lib/hooks/index.ts`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastCard/**`,
  `.../OverviewTab/OverviewTab.tsx`, `.../_lib/usePrDetailPage.ts`,
  `client/messages/en/blast.json`, plus the BlastCard/hook RTL tests): `useBlast` hook, `BlastCard`
  panel + Overview wiring + invalidation + the 2 degraded i18n keys + tests.

## Optional / out of scope (follow-ups, not in this plan)

- **Wire the MCP `devdigest_get_blast_radius` tool** to the real engine (the stub at
  `mcp-server/src/tools/get-blast-radius.ts` already documents the exact path); requires loosening
  `getBlastRadiusOutput.status` off `z.literal('not_implemented')`.
- **One-paragraph LLM summary** for `summary` (exactly one cheap model call; acceptance allows it).
- **Real Graph view** (node-link); the `view.graph` / `graph.ariaLabel` keys already anticipate it.
- **Stretch CLI** `devdigest review --mode working` (review uncommitted changes pre-push).
