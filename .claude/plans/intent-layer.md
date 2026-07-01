# Intent Layer — Development Plan

## Context
**Why:** DevDigest reviews a PR's *diff* but never makes the PR's **intent** explicit.
The Intent Layer derives, before the review, what a PR is *trying to do* — its summary
and what is in / out of scope — so (a) the reviewer agent can stay on-scope and stop
flooding the user with out-of-scope noise, and (b) the user sees the machine's
understanding of the PR *before* reading findings.

**What prompts it:** Lesson L03. Much of the scaffolding already exists but is **unwired**:
the `review_intent` feature-model, the `Intent` Zod schema, the `pr_intent` table, the
`upsertIntent`/`getIntent` repo funcs, and `run-executor` comments that already say it
"Loads the diff + intent once". This plan connects those pieces and adds the classifier,
API, prompt injection, and UI card.

**Outcome:** A cheap (flash-class) model classifies PR intent from title + body + linked
issue + **changed-file paths and hunk headers only (no diff bodies)** — logging the tokens
saved — stores it per-PR, injects an `## PR intent` block (with a scope-discipline rule)
into the review prompt, and renders an Intent card on the PR page with a Recompute button.

### Confirmed decisions
- **Schema = spec exactly:** `Intent { intent (=summary), in_scope[], out_of_scope[] }`.
  Reuse existing `Intent` (no DB/migration/contract change). `summary` maps to the
  existing `intent` field/column.
- **RISK AREAS in the mock is OUT OF SCOPE** — that belongs to the separate existing
  `risk_brief` feature; do not add a `risk[]` field here.
- **Lifecycle:** lazy compute-on-demand + manual Recompute. `GET` only reads; the card
  auto-fires recompute once when intent is absent. The **review pipeline never triggers
  computation and is never blocked** — it injects only what is already stored.
- **Cheap model:** flip `review_intent` default to `openrouter` / `deepseek/deepseek-v4-flash`
  (the value `onboarding` already uses).
- **Resolve referenced specs/plans/tickets (explicit):** the classifier does NOT rely on
  raw body text alone. It resolves what the PR description *points to* and feeds the actual
  content in:
  - **Linked ticket/issue** → reuse `resolveLinkedIssue` (already surfaced as
    `PrDetail.linked_issue` with `IssueMeta.body`). Feed issue title + body.
  - **In-repo spec / work-plan files** referenced in the body (e.g. `docs/spec.md`,
    `.claude/plans/foo.md`, an RFC path) → read their content via `container.git.readFile`
    (local clone, **no network**), best-effort, size-capped, untrusted-wrapped.
  - **Network policy:** outbound is allowed only to GitHub + the LLM (CLAUDE.md). So we do
    **NOT** fetch arbitrary external URLs (Notion/Confluence/etc.) — only the GitHub issue
    (already allowed) and in-repo files (no network). A non-GitHub URL in the body is left
    as plain text, not fetched.
- **Edge case (explicit):** if the PR body has no doc/ticket/spec AND no referenced files
  resolve, the classifier still infers intent from implicit data (file paths + hunk
  headers). If a spec/plan/issue IS present, prefer it. Both branches live in the
  classifier system prompt.

---

## Slices (non-overlapping file ownership — safe to run in parallel)

### Slice A — Contracts & model registry (cheap-model default)
One-line default flip, mirrored in 3 files:
- `server/src/vendor/shared/contracts/platform.ts` — `review_intent` entry → `defaultProvider: 'openrouter'`, `defaultModel: 'deepseek/deepseek-v4-flash'`.
- `client/src/vendor/shared/contracts/platform.ts` — mirror.
- `client/src/lib/feature-models.ts` — mirror.
No new schema needed — `Intent` in `*/vendor/shared/contracts/brief.ts` is reused as-is.

### Slice B — reviewer-core (pure engine: prompt injection)
Keep reviewer-core pure — it only *receives* intent strings; no DB/network.
- `reviewer-core/src/prompt.ts`:
  - Add to `PromptParts`: `intent?: { summary: string; inScope: string[]; outOfScope: string[] }`.
  - In `assemblePrompt`, when present, push a section **before** `## Diff to review`:
    - A **trusted** scope-discipline rule (NOT wrapped — it is an instruction):
      `## PR intent (scope discipline)` + text: *"The block below is the machine-derived
      intent/scope of this PR. Review what is in scope. Do NOT raise findings about matters
      outside the stated scope — EXCEPT: if you spot a single serious correctness/security
      problem that is out of scope, emit exactly ONE signal finding, never many. In-scope
      defects are always reported in full."*
    - Then the **untrusted** content via `wrapUntrusted('intent', …)` rendering summary +
      `In scope:` / `Out of scope:` bullets.
  - This complements the existing `INJECTION_GUARD` (already names "derived intent/scope"
    as untrusted, and already guarantees real in-scope defects can't be descoped). Leave
    the `PromptAssembly` trace contract unchanged — intent text already shows up inside the
    assembled `user` string.
- `reviewer-core/src/review/run.ts`: add `intent?` to `ReviewInput`; thread it into
  `promptParts` (pass-through only).
- New `reviewer-core/src/prompt.test.ts`: assert the `## PR intent` section + the one-signal
  rule render when intent present, content is `<untrusted source="intent">`-wrapped, and the
  section is omitted when intent is absent.

### Slice C — Backend: classifier module + persistence + review threading
New module `server/src/modules/intent/` (owns its routes; reuses reviews-domain plumbing).
Layering (onion): `routes.ts` → `IntentService` → (`ReviewRepository` + `loadDiff` + `resolveAvailableLlm`).
- `server/src/modules/intent/schemas.ts` (new):
  - `INTENT_SCHEMA = 'IntentClassification'`; reuse vendored `Intent` Zod as structured output.
  - `extractHunkHeaders(diff)` — per changed file keep only `@@ … @@` header lines from
    `diff.raw` (regex `/^@@ .* @@/`); **no `+`/`-` content lines**. (Reconstruct from
    `diff.files[].hunks` if `.raw` unavailable.)
  - `extractReferencedPaths(body)` — pull in-repo spec/plan file paths from the PR body:
    markdown links `[..](path)` and bare tokens matching `/[\w./-]+\.(md|mdx|txt|rst|adoc)/`,
    with a bias toward `docs/`, `.claude/plans/`, `spec`, `rfc`. Returns a deduped, capped
    (≤5) list of repo-relative paths. (No util for this exists today — small new helper.)
  - `buildIntentMessages({ title, body, linkedIssue, specs, files })` → `ChatMessage[]`,
    mirroring `conventions/schemas.ts` `buildExtractionMessages`. System prompt carries the
    **edge-case branch** (a linked issue / spec / plan present → derive intent primarily from
    it; none present → infer from file paths + hunk headers; always return all three fields).
    User content wraps body / linked-issue body / each resolved spec file / file-header blocks
    via `wrapUntrusted` (imported from `@devdigest/reviewer-core`).
  - `approxTokens(s) = Math.ceil(s.length / 4)` (no tokenizer dep in repo).
- `server/src/modules/intent/service.ts` (new) — `IntentService`:
  - `get(workspaceId, prId)` → `ReviewRepository.getIntent` → `Intent | null` (read-only).
  - `recompute(workspaceId, prId, log)`:
    - `loadDiff` (changed files + hunk headers).
    - **Reference resolution (best-effort, each try/catch — never blocks):**
      linked issue via `container.github().getPullRequest(...)` (gives `linked_issue` with
      body); referenced in-repo specs/plans via `extractReferencedPaths(body)` →
      `container.git.readFile(repo, path)` for each (local clone, **no network**),
      size-capped (~4k chars/file, total budget ~12k), skipped on error/missing.
    - `resolveAvailableLlm(container, workspaceId, 'review_intent')` →
      `llm.completeStructured<Intent>({ schema: Intent, schemaName: INTENT_SCHEMA, messages })`
      → `upsertIntent` → return `{ intent, token_savings }`.
    - Log which references resolved (issue #, spec paths) so it's visible what fed the intent.
  - **Token-savings log:** `fullDiffTokens = approxTokens(diff.raw)`,
    `classifierTokensIn = result.tokensIn`, `saved = full - classifier`;
    `log.info({ prId, fullDiffTokens, classifierTokensIn, saved, ratio }, 'intent: classified from hunk-headers only')`.
- `server/src/modules/intent/routes.ts` (new): `GET /pulls/:id/intent` (read);
  `POST /pulls/:id/intent/recompute` (classify+persist+return). Tight `rateLimit` like
  `reviews/routes.ts` since it makes an LLM call. POST response = inline Zod schema in the
  route file (pattern: conventions `routes.ts`) — keeps vendored contracts untouched.
- `server/src/modules/index.ts` — register the `intent` module (one import + one registry line).
- `server/src/modules/reviews/run-executor.ts` — **the injection point** (the comments here
  already anticipate it): in `executeRuns`, after the diff loads (~line 106), load intent once
  `const intent = await this.repo.getIntent(pull.id)`; pass into `runOneAgent`; in the
  `reviewPullRequest({...})` call (~line 198) add
  `...(intent ? { intent: { summary: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope } } : {})`.
  Absent intent → section omitted; review never blocked.
- `server/src/adapters/mocks.ts` — add an `IntentClassification` fixture to
  `MockLLMProvider.structuredBySchema` (required by hermetic tests; same note as conventions).
- Tests: `intent/schemas.test.ts` (headers-only, no content leak; missing body AND missing
  linked-issue branches; token math), `intent/service.test.ts` (recompute persists + logs;
  get→null when absent), `intent.it.test.ts` (POST creates `pr_intent` row, GET returns it,
  re-recompute upserts one row).

### Slice D — Client: Intent card + hook + Settings note
- `client/src/lib/hooks/intent.ts` (new) — `useIntent(prId)` (GET) and
  `useRecomputeIntent(prId)` (POST), mirroring `client/src/lib/hooks/conventions.ts`;
  export from `client/src/lib/hooks/index.ts`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/` (new dir:
  `IntentCard.tsx`, `index.ts`, `styles.ts`, `IntentCard.test.tsx`): renders the design —
  italic summary, IN SCOPE / OUT OF SCOPE lists, a Recompute button, an empty state that
  auto-fires recompute once when intent is absent, and a loading skeleton. (No RISK AREAS.)
  Strings in `client/messages/*.json` per client conventions (no hardcoded JSX text).
- `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` —
  accept `prId`, render `<IntentCard prId={prId} />` (placed in the INTENT slot of the design).
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` — pass `prId` to `<OverviewTab>`.
- Settings: `review_intent` already appears in the generic `SettingsModels` picker via
  `FEATURE_MODELS` — **no new Settings UI**; Slice A's default flip is the only change.

> Confirm exact client PR-page paths during implementation (find the page that renders the
> PR brief/overview); the directory names above are the expected App Router locations.

---

## Reused existing code (do not recreate)
- `Intent` Zod — `*/vendor/shared/contracts/brief.ts`
- `pr_intent` table — `server/src/db/schema/reviews.ts`
- `upsertIntent` / `getIntent` — `server/src/modules/reviews/repository/pull.repo.ts` (via `repository.ts`)
- `resolveAvailableLlm(container, workspaceId, featureId)` — `server/src/modules/settings/feature-models.ts`
- `loadDiff(...)` — `server/src/modules/reviews/diff-loader.ts`
- `resolveLinkedIssue` / `IssueMeta.body` / `PrDetail.linked_issue` — `server/src/adapters/github/octokit.ts`, `*/vendor/shared/contracts/platform.ts`
- `container.git.readFile(repo, path)` — `server/src/adapters/git/simple-git.ts` (local clone, no network)
- `wrapUntrusted` + `assemblePrompt` + `INJECTION_GUARD` — `reviewer-core/src/prompt.ts`
- classifier message-builder pattern — `server/src/modules/conventions/schemas.ts` + `service.ts`
- model picker UI — `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/`

## Skills to apply per file type
- server files → `onion-architecture`, `fastify-best-practices`, `zod`, `drizzle-orm-patterns`, `security`
- reviewer-core → `typescript-expert`, `security` (prompt-injection)
- client files → `frontend-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`
- all → `pr-self-review` before commit

---

## Verification (end-to-end)
1. `cd reviewer-core && pnpm test` — `prompt.test.ts`: intent section + one-signal rule render; omitted when absent.
2. `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — classifier builds headers-only input (no `+`/`-` leak), handles missing body + missing linked issue, token math; `extractReferencedPaths` pulls in-repo `.md`/plan paths and ignores external URLs; reference resolution feeds linked-issue body + resolved spec file content into the messages, and degrades gracefully when a referenced file is missing (best-effort, no throw); service persists + logs savings + which references resolved.
3. `cd server && pnpm exec vitest run .it.test` — `intent.it.test.ts`: POST creates `pr_intent`, GET returns it, re-recompute upserts.
4. `cd client && pnpm test` — `IntentCard.test.tsx`: summary/scope lists, empty-state auto-generate, Recompute fires mutation, skeleton.
5. `pnpm typecheck` in all three packages.
6. **Manual:** `./scripts/dev.sh` → open a PR → Intent card lazily computes & shows summary/scope → edit PR body → Recompute → card updates → run a review → open the run trace and confirm the `## PR intent` block + scope rule are in the assembled prompt → confirm server log emits `intent: classified from hunk-headers only` with `saved > 0`. Also verify Settings → Models shows `PR Review · Intent` defaulting to the deepseek flash model.
   - **Reference resolution:** test a PR whose body links a ticket (`closes #N`) and an in-repo spec/plan (e.g. `docs/spec.md`) → confirm the intent reflects that content and the log lists the resolved issue # / spec paths; test a PR with an empty body → confirm intent still infers from file paths + hunk headers.
