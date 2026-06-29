# Smart Diff — risk-ordered PR diff (L03)

## Context

Reviewers waste their freshest attention on noise: a 90-line `package-lock.json`
sits next to the 5 lines of business logic that actually need scrutiny. **Smart
Diff** re-lays a PR's changed files by *role* so the reviewer's eye lands on
business logic first and boilerplate is collapsed out of the way.

The key constraint: **Smart Diff makes no new LLM call.** The expensive model
call already happened in the Structured Reviewer (`GET /pulls/:id/reviews`).
Smart Diff is a *deterministic composition* of two things already in the DB:

- **PR files** (`pr_files`: `path`, `additions`, `deletions`, `patch`) — imported by the `pulls` module, available the moment a PR is imported (no review needed).
- **Latest review's findings** (`findings`: `file`, `start_line`) — present only after the first *Run Review*. Before that, grouping still works; there's just no findings overlay.

It composes them into the **already-existing** `SmartDiff` contract
(`vendor/shared/contracts/brief.ts`): `groups[{ role, files[] }]` +
`split_suggestion`. The UI shows a "Smart order | Original order" toggle inside
the existing **Files changed** tab, boilerplate collapsed, a clickable
"N findings" badge per file that scrolls to the finding's line.

## What already exists (reuse — do NOT rebuild)

- **Contract is done.** `SmartDiff`, `SmartDiffGroup`, `SmartDiffRole` (`'core' | 'wiring' | 'boilerplate'`), `SmartDiffFile` (has `finding_lines: number[]`), `ProposedSplit`, `split_suggestion` are all in `server/src/vendor/shared/contracts/brief.ts` **and** the client copy. **No contract / vendor change needed.**
- **Server template:** `server/src/modules/intent/{routes,service}.ts` — routes → service → `container.reviewRepo`, no Drizzle in the service. Copy this layering. (Smart Diff is *simpler*: no `loadDiff`, no `resolveAvailableLlm`, no LLM.)
- **Repo facade:** `container.reviewRepo` already exposes everything needed:
  - `getPull(workspaceId, prId)` — workspace-scoped PR row (`server/src/modules/reviews/repository.ts:30`)
  - `getPrFiles(prId)` → `pr_files` rows with `path/additions/deletions/patch` (`repository.ts:38`)
  - `reviewsForPull(prId)` → reviews **newest-first**, each with its findings; `[0]` is the latest review (`repository.ts:63`, impl `repository/review.repo.ts:58`). Finding rows carry `file` + `startLine`.
- **Module registry:** `server/src/modules/index.ts` — add one import + one entry (the file even names `intent/smart-diff` as the expected lesson module).
- **Client diff stack (shared):** `client/src/components/diff-viewer/` — `DiffViewer` → `FileCard` (collapsible, parses `patch`, already renders +/- stat & a badge slot) → `CodeLine` (renders gutter line numbers `ln.newNo ?? ln.oldNo`). Reuse `FileCard`/`CodeLine`; extend them with finding props.
- **Client tab host:** `DiffTab` (`.../pulls/[number]/_components/DiffTab/DiffTab.tsx`) renders the Files-changed tab today; the toggle lives here.
- **Client hook template:** `client/src/lib/hooks/intent.ts` + `client/src/lib/api.ts` (`api.get`). PR detail provides `pr.files` (with patches) via `usePullDetail`.

## Architecture decisions

- **New server module `smart-diff`** (mirrors `intent`), route `GET /pulls/:id/smart-diff`. Pure read + deterministic compose — **never** imports `resolveAvailableLlm`/`llm`.
- **Thresholds & patterns are constants**, not inlined — `server/src/modules/smart-diff/constants.ts` (acceptance criterion).
- **Classification by path/pattern** into `core` / `wiring` / `boilerplate`. Lock-files **always** → boilerplate.
- **`split_suggestion` computed deterministically** + a light "PR is large — consider splitting" banner when `too_big`.
- **No seed fixture** — demo runs on a real GitHub PR; tests use hermetic in-memory fixtures.

---

## Slice 1 — Server: `smart-diff` module (owns `server/src/modules/smart-diff/**` + `modules/index.ts` one-line edit)

### `constants.ts` — patterns & thresholds (single source)
```ts
// Classification (first match wins, evaluated boilerplate → wiring → core).
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/,
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  /(^|\/)__snapshots__\//, /\.snap$/,
  /\.min\.(js|css)$/, /\.(map)$/,
];
export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.(ts|tsx|js|jsx)$/,          // barrels
  /\.config\.(ts|js|cjs|mjs|json)$/,
  /(^|\/)(tsconfig.*\.json|package\.json)$/,
  /(^|\/)(\.env.*|.*\.ya?ml|Dockerfile|docker-compose\.ya?ml)$/,
  /(^|\/)(server|app|main|config|wiring|routes?)\.(ts|tsx|js)$/,
];
// Everything else → 'core'.
export const GROUP_ORDER = ['core', 'wiring', 'boilerplate'] as const; // render order
export const SPLIT_TOTAL_LINES_THRESHOLD = 500; // sum of core+wiring add/del → too_big
export const SPLIT_MIN_GROUPS = 2;              // need ≥2 dir-clusters to suggest a split
```

### `classify.ts` — pure, hermetically testable
- `classifyFile(path): SmartDiffRole` — test boilerplate → wiring → core in order.
- `buildSmartDiff(files, latestFindings): SmartDiff`:
  - Map findings by `file` → unique sorted `start_line[]` → each file's `finding_lines`.
  - Bucket files into the three roles; **sort within a group** by `finding_lines.length` desc, then `additions+deletions` desc (findings + biggest diffs float to the top).
  - Emit `groups` in `GROUP_ORDER`, **omitting empty groups**.
  - `split_suggestion`: `total_lines` = Σ(add+del) over core+wiring; cluster core files by top-level dir; `too_big = total_lines > SPLIT_TOTAL_LINES_THRESHOLD && clusters ≥ SPLIT_MIN_GROUPS`; `proposed_splits` = one `{name: dir, files}` per cluster (only when `too_big`, else `[]`).
  - `pseudocode_summary` left `null` (out of scope for L03).

### `service.ts` — `SmartDiffService(container)`
- `build(workspaceId, prId): Promise<SmartDiff>`:
  - `getPull` → 404 (`NotFoundError`) if missing.
  - `files = reviewRepo.getPrFiles(prId)`.
  - `reviews = reviewRepo.reviewsForPull(prId)`; `latest = reviews[0]`; `findings = latest?.findings ?? []` (→ `{file, start_line: startLine}`).
  - `return buildSmartDiff(files, findings)`.
  - **No LLM import anywhere in this file** — this is what makes the feature free.

### `routes.ts` — mirror `intent/routes.ts`
- `GET /pulls/:id/smart-diff` (`schema: { params: IdParams }`), `getContext` for `workspaceId`, returns `SmartDiff.parse(await service.build(...))`. No POST, no rate-limit override needed.

### Register: `server/src/modules/index.ts`
- `import smartDiff from './smart-diff/routes.js';` + `smartDiff,` in the `modules` map.

### Tests (server)
- `smart-diff/classify.test.ts` (hermetic): lock-file → boilerplate; `index.ts`/`*.config.*`/`server.ts` → wiring; a handler → core; findings map to `finding_lines`; within-group ordering; `split_suggestion.too_big` flips on the threshold; lock-file excluded from `total_lines`.
- `smart-diff/routes.it.test.ts` (testcontainers): seed a PR + `pr_files` + one review w/ findings via the DB, `app.inject('GET /pulls/:id/smart-diff')` → 200, boilerplate last & lock-file in it, finding badges present. **Assert the LLM mock recorded zero calls** (free-feature guarantee). 404 for unknown id. Pre-review case: same PR with no review → groups present, all `finding_lines` empty.

---

## Slice 2 — Client: SmartDiffViewer + toggle (owns `components/diff-viewer/SmartDiffViewer/**`, `lib/hooks/smart-diff.ts`, `DiffTab`, small additive edits to `FileCard`/`CodeLine`, messages)

### `lib/hooks/smart-diff.ts` (template: `lib/hooks/intent.ts`)
```ts
export function useSmartDiff(prId) {
  return useQuery({ queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`), enabled: !!prId });
}
```
- Invalidate in `usePrDetailPage.ts` `onRunDone()` (next to `refetchReviews()`): `qc.invalidateQueries({ queryKey: ["smart-diff", prId] })` so badges appear after a review.

### Extend `FileCard` + `CodeLine` (additive, backward-compatible)
- `FileCard`: optional `findingLines?: number[]`. When set & non-empty: render a clickable **"N findings"** badge in the header (reuse the existing comment-count badge slot styling); default-open the card if it has findings; pass `findingLines` down.
- `CodeLine`: optional `highlight?: boolean` + stable `id` anchor for finding lines, e.g. `id={anchorId(path, ln.newNo)}` (helper in `diff-viewer/helpers.ts`: `anchorId(path, line) => 'diffline-' + slug`). Highlighted rows get a left-border/tint (reuse `styles.ts`).

### `SmartDiffViewer/SmartDiffViewer.tsx`
- Props: `groups: SmartDiffGroup[]`, `files: PrFile[]` (from `pr.files`, source of `patch`), `splitSuggestion`, `commenting?`.
- Join each `SmartDiffFile` to its `PrFile` by `path` (patch lives on `PrFile`).
- Render `GROUP_ORDER` headers (Core / Wiring / Boilerplate) with the screenshot's sublabels ("The substance of the change — review closely", etc.); **boilerplate group collapsed by default**.
- Each file → `<FileCard file={prFile} findingLines={sf.finding_lines} commenting={commenting} />`.
- Badge click → set `target = {path, line: finding_lines[0]}`; `useEffect` opens the file and `document.getElementById(anchorId(path,line))?.scrollIntoView({block:'center'})` + transient highlight.
- When `splitSuggestion.too_big`: a light banner "This PR is large (~{total_lines} lines) — consider splitting into {proposed_splits.length} parts".
- Empty/loading states via the hook.

### `DiffTab` — the toggle
- Add `prId`-driven `useSmartDiff`. Header gets a **"Smart order | Original order"** segmented toggle (default **Smart**) + "REVIEWER-ORDERED DIFF" label.
- Smart → `<SmartDiffViewer groups files splitSuggestion commenting />`; Original → existing `<DiffViewer files commenting />` (unchanged fallback; also used if smart-diff errors/loads).

### i18n + tests
- New strings in `client/messages/*` under `shell.smartDiff.*` (no hardcoded JSX).
- `SmartDiffViewer.test.tsx` (RTL): boilerplate collapsed by default; core group first; "N findings" badge shows count & is clickable; clicking calls scroll on the right anchor (assert observable behavior — file opens / target row in document). Follow the react-testing-library skill.

---

## Slice 3 — Infra: single-command verify (owns new root `package.json`)

- Create a **minimal private root `package.json`** (no `workspaces` — repo stays non-workspace):
```jsonc
{ "name": "dev-digest", "private": true, "scripts": {
  "verify:l03": "pnpm -C server typecheck && pnpm -C server exec vitest run smart-diff && pnpm -C client typecheck && pnpm -C client exec vitest run SmartDiffViewer"
} }
```
- Green `pnpm verify:l03` from repo root = typecheck both packages + run the new Smart Diff server & client tests (the server IT test encodes the no-LLM guarantee).

---

## Skills to apply per file
- Server (`smart-diff/**`): `fastify-best-practices`, `onion-architecture`, `zod`, `typescript-expert`; tests via the server Vitest split (`*.it.test.ts` = testcontainers).
- Client (`SmartDiffViewer`, hook, `DiffTab`): `react-best-practices`, `next-best-practices`, `frontend-architecture`, `react-testing-library`.
- All: `pr-self-review` before any commit.
- Read `server/INSIGHTS.md` and `client/INSIGHTS.md` before working in each.

## Verification (end-to-end)

1. `pnpm verify:l03` from repo root → green (typecheck + Smart Diff tests pass).
2. `./scripts/dev.sh`; open a **large real PR** (with a lock-file) in a connected repo → **Files changed** tab:
   - "Smart order" is the default; **Core files on top, `package-lock.json` in Boilerplate and collapsed**; large-PR banner shows if `too_big`.
   - Toggle to "Original order" → original file order via the unchanged `DiffViewer`.
3. Click **Run Review**; when it finishes → **"N findings" badges** appear on the files the latest review flagged. Click a badge → the file opens and the diff **scrolls to that line** (highlighted).
4. Open the run/server logs around the Smart Diff fetch → **no new LLM call / no `agent_runs` row** created by `GET /pulls/:id/smart-diff` (free-by-tokens). The server IT test asserts the same (LLM mock = 0 calls).
5. Confirm thresholds/patterns live only in `smart-diff/constants.ts` (none inlined).
6. Open a PR with a clear description; jot 3 takeaways into the homework notes.
