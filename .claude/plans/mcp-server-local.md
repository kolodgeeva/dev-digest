# Development Plan — `@devdigest/mcp` (local-first MCP server, 5 tools)

> **🔄 Revision R8 — HTTP transport pivot (this revision, overrides §§1,3,5,6,8,9,12,13 below).**
> The shipped v1 MCP server is an **in-process composition root**: it imports
> `@server/*`, calls `loadConfig` → `createDb` → `new Container`, and runs the
> review **executor inside the MCP process** (`mcp-server/src/composition.ts`).
> That is why it needs `DATABASE_URL` + LLM keys and a migrated DB — it *is* a
> second copy of the engine, parallel to the Fastify API.
>
> **New target: the MCP server is a thin HTTP client of the already-running
> Fastify API** (`./scripts/dev.sh`, default `http://localhost:3001`). It no
> longer opens a DB connection, builds a `Container`, or holds provider keys.
> The review still runs **once**, inside the API process (where the real
> `runBus`, DB and keys already live); MCP just calls it over HTTP.
>
> Net effect on the original concern: **MCP needs only `DEVDIGEST_API_URL`** —
> no `DATABASE_URL`, no LLM keys. The trade-off: the API must be up first (MCP
> is no longer self-sufficient). See §3.1 (HTTP surface) and §8 (slices) for the
> full diff from v1.
>
> **Preserving "outcome, not operation".** v1 returned a synchronous verdict
> because `runBus.onDone` fired in-process. Over HTTP there is no shared
> `runBus`, so the create→wait→collect loop **moves onto the server** as one new
> synchronous endpoint (`POST /reviews/run-sync`). The MCP write tool becomes a
> single `fetch`; the non-polling wait stays server-side where `runBus` lives.
> (Rejected alternative: client-side polling of `GET /runs/:id` — more
> round-trips, reintroduces polling, and still wouldn't let MCP shed its deps.)

> **Compliance addendum (post-v1-implementation, R1–R7).** The shipped code was
> brought into full compliance with the formal Requirements, which override a
> few earlier choices in this plan: package dir is **`mcp-server/`** (not `mcp/`);
> tools are namespaced **`devdigest_*`**; `list_agents` returns **`id, name,
> enabled, model`** (not `description`); `get_findings` adds **`response_format:
> "concise" | "detailed"`** (summary-first); every tool input field has a
> `.describe()`; the `run_agent_on_pr` wait caps at **120s**
> (`MCP_RUN_TIMEOUT_MS` default 120000). Read tool names/paths below with those
> substitutions.

## 1. Context

DevDigest today exposes its AI PR-review engine only through the Fastify HTTP API (`server/`) and the Next.js studio (`client/`). We want a **local-first MCP server** so an external coding agent (Claude Code, Cursor, etc.) can drive DevDigest reviews directly over **stdio** — list the configured reviewer agents, run one against a PR and get a concise verdict back, re-read prior runs, fetch a repo's vetted conventions, and (future) query a PR's blast radius.

The design is deliberately **"outcome, not operation"**: the existing HTTP review flow is asynchronous (returns `run_id`s immediately, streams progress over SSE — `server/src/modules/reviews/service.ts:103`/`:133`). For an LLM tool-caller that pattern is hostile (it would have to poll/stream). So the single write tool internally does create → wait → collect and returns `{ verdict, findings[] }` in one call, falling back to a `run_id` only if an internal timeout trips.

Critically, **everything is reuse** — but **over HTTP, not in-process (R8)**: the
MCP package is a thin **HTTP-client presentation layer** over the running Fastify
API. The review engine, services (`AgentsService`, `ReviewService`,
`ConventionsService`), DI `Container`, DB and provider keys all stay **inside the
API process**; MCP holds none of them. The only thing MCP still borrows at the
type level is `@devdigest/shared` (Finding/Verdict/Agent/ConventionCandidate), to
shape its tool output schemas — aliased exactly as `reviewer-core/tsconfig.json`
does (`@devdigest/shared` → `../server/src/vendor/shared/index.ts`). It is **not**
a workspace member and imports **no `@server/*` runtime** anymore.

### Agreed design decisions (from the user + the slides)
- **Outcome, not operation** — `run_agent_on_pr` does create→wait→collect in one synchronous call.
- **Flat arguments** — `repo, pr, agent` as separate scalars (no nested objects).
- **Concise structured responses** — `{ verdict, findings[] }`, only the needed fields.
- **Errors lead onward** — actionable next step, not a bare 404.
- **Lean schemas + client-side deferred loading** for startup token cost — no code-execution/progressive-disclosure layer (overkill for 5 tools).
- **Cursor-based pagination** on list/findings.
- All 5 are **Tools** (not Resources); **stdio** transport; separate package `mcp/`.

## 2. Scope

**In scope**
- New package `mcp/` (`@devdigest/mcp`): own `package.json` + lockfile, `tsconfig.json` with path aliases, stdio entrypoint, build/run scripts.
- 5 MCP **Tools** with Zod **input + output schemas** (structured content) and MCP annotations: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (stub).
- Thin **server-side reuse seams** in the `reviews` module only: resolve `(repo fullName, pr number) → prId/repoId`, resolve `repoFullName → repoId`, read a run's concise outcome by `run_id`, and read run status by `run_id`.
- Cursor-based pagination on `list_agents` and `get_findings`.
- Unit tests (hermetic, mocked services) for the MCP layer; one DB-backed `*.it.test.ts` for the new server seams.

**Out of scope**
- Real `get_blast_radius` (stub only; contract shaped so wiring to `container.repoIntel.getBlastRadius` is trivial later — `server/src/modules/repo-intel/types.ts:147`).
- HTTP transport / SSE for MCP (stdio only).
- Editing vendored `*/vendor/shared/**`.
- Client/UI changes; auth beyond the existing `LocalNoAuthProvider` default workspace.
- New DB tables or migrations.

## 3. Module map consulted

| Package / module | Why |
|---|---|
| `reviewer-core/` (`reviewPullRequest`, `Review`/`Finding`/`Verdict`) | The pure engine the run drives; `ReviewOutcome` carries `costUsd`/grounding. `src/index.ts:38`. |
| `server/src/modules/agents` | `AgentsService.list(workspaceId)` → `Agent[]` for `list_agents`. `service.ts:58`; contract `knowledge.ts:176`. |
| `server/src/modules/reviews` | `resolveTargets` (`service.ts:46`) + `runReview` (`:103`) for `run_agent_on_pr`; `reviewsForPull`/`repository/*.repo.ts` for outcome reads. New seams live here. |
| `server/src/modules/conventions` | `ConventionsService.list(workspaceId, repoId)` → `ConventionCandidate[]` for `get_conventions`. `service.ts:54`; contract `knowledge.ts:144`. |
| `server/src/modules/repo-intel` | `RepoIntel.getBlastRadius` + `BlastResult` to align the stub. `types.ts:74,147`. |
| `server/src/modules/repos` | `RepoRepository.findByFullName` (`repository.ts:24`) — repo-resolution pattern. |
| `server/src/platform` | `Container` (`container.ts`), `loadConfig` (`config.ts:64`), `runBus` + `onDone`/`complete` (`sse.ts:76,90`). |
| `server/src/db` | `createDb` (`client.ts:17`); `reviews.run_id` / `agent_runs` / `pull_requests` / `repos`. |
| `server/src/adapters/auth/local.ts` | `currentWorkspace()` ignores the request arg → `getContext` resolves the default workspace with no token, so **MCP's HTTP calls need no auth header** (`:28`). |

### 3.1 HTTP surface — what each tool calls (R8)

The MCP client targets `DEVDIGEST_API_URL` (default `http://localhost:3001`). All
new routes are **thin** — they only call the Slice A service methods that already
exist (`service.ts:46–134`); no new business logic.

| Tool | HTTP call | Server side (reused) | Status |
|---|---|---|---|
| `list_agents` | `GET /agents` | `AgentsService.list` | **exists** — paginate client-side |
| `run_agent_on_pr` | `POST /reviews/run-sync` `{repo,pr,agent}` | `resolveTargets` → `resolvePullRef` → `runReview` → `runBus.onDone` race vs `MCP_RUN_TIMEOUT_MS` → `runOutcome` | **NEW route** (composite, synchronous) |
| `get_findings` | `GET /runs/:id/outcome` | `runOutcome(workspaceId, runId)` | **NEW route** (run-keyed; existing `/pulls/:id/reviews` is PR-keyed) |
| `get_conventions` | `GET /conventions?repo=owner/name` | `ConventionsService.listByRepoFullName` (resolves id in-module) | **NEW route** (name-keyed; existing `/repos/:id/conventions` is id-keyed) |
| `get_blast_radius` | — (client stub) | none | stub, unchanged |

The synchronous wait (`runBus.onDone` race vs timeout) lives **in the new
`/reviews/run-sync` handler**, not in MCP — that is the whole point of R8.

## 4. Insights to respect (from `INSIGHTS.md`)

- **Reuse via container getter, never `new XRepository` / inline Drizzle in a service** — `server/INSIGHTS.md:29`. New resolver/outcome reads are repository methods called by `ReviewService`.
- **`@devdigest/shared` is vendored, hand-synced, do-not-edit** — root `INSIGHTS.md:30`. MCP-tool I/O is package-local (`mcp/src/contracts/*`), composed from `@devdigest/shared` via `.pick()`.
- **Hermetic LLM tests need both `overrides.llm[provider]` and `overrides.secrets`** — `server/INSIGHTS.md:24`.
- **Onion layering is machine-enforced** (`pnpm lint:arch`) — `server/INSIGHTS.md:34`. Slice A stays inside the reviews module; clean reference module = `modules/agents/`.
- **Per-run cost already in `ReviewOutcome.costUsd`; never recompute.** Read paths read denormalized fields; no model calls.
- **`reviewer-core` aliases `@devdigest/shared` to the server copy** — MCP mirrors this; does not vendor its own copy.
- **`pnpm db:migrate` does not run on boot** — verification requires Postgres up + migrated + seeded.

## 5. Files to modify / create

### MCP package `mcp-server/` — R8 changes only (v1 scaffold already shipped)
```
mcp-server/
├── package.json                         # ↓ DROP deps no longer used in-process: drizzle-orm, postgres,
│                                        #   octokit, openai, @anthropic-ai/sdk, p-queue, js-tiktoken,
│                                        #   simple-git, graphology*, @ast-grep/napi, @vscode/ripgrep,
│                                        #   dependency-cruiser. KEEP: @modelcontextprotocol/sdk, zod, dotenv.
├── tsconfig.json                        # drop @server/* runtime aliases; KEEP @devdigest/shared (types only)
├── src/
│   ├── index.ts                         # ~ build http client (not Container) → register tools → Stdio transport
│   ├── http-client.ts                   # NEW (replaces composition.ts): DEVDIGEST_API_URL → typed fetch client
│   │                                    #   implementing ToolDeps; no DB, no Container, no graceful DB close
│   ├── deps.ts                          # ~ ToolDeps REDESIGNED: 4 endpoint-shaped methods
│                                        #   (listAgents, runAgentOnPr, getOutcome, getConventions)
│   ├── server.ts                        # UNCHANGED — registerTool × 5 over the same ToolDeps
│   ├── pagination.ts                    # UNCHANGED
│   ├── errors.ts                        # ~ map fetch/HTTP failures (ECONNREFUSED, 404, 5xx) → actionable text
│   ├── contracts/{common,tools}.ts      # UNCHANGED (transport shapes are the same)
│   └── tools/*.ts                        # ~ CHANGED to the new deps: run-agent-on-pr collapses
│                                        #   resolve→run→wait→outcome into one runAgentOnPr() call;
│                                        #   all tools wrap deps calls in toolErrorFromApi (transport errors)
│   └── tools/__tests__/                 # ~ fakes already mock ToolDeps → mostly unchanged; add HTTP-client unit test
└── composition.ts                       # ❌ DELETE (in-process Container root no longer used)
```

### Server — expose the 3 HTTP routes (reviews + conventions modules)
> The reviews seams (`resolveTargets`, `resolvePullRef`, `runOutcome`, …) **already
> landed in v1** — the reviews routes only call them. The conventions side needed
> a small in-module addition: the onion lint forbids `conventions/routes →
> reviews/service`, so name-resolution lives in the **conventions** module, not via
> `ReviewService.resolveRepoId` (mirrors how reviews keeps its own repo lookup).
```
server/src/modules/reviews/routes.ts             # + POST /reviews/run-sync (composite create→wait→collect)
                                                 # + GET  /runs/:id/outcome  (runOutcome → RunOutcomeDto)
server/src/modules/conventions/routes.ts         # + GET  /conventions?repo= (→ service.listByRepoFullName)
server/src/modules/conventions/service.ts        # + listByRepoFullName() — resolve id in-module, then list
server/src/modules/conventions/repository.ts     # + findRepoIdByFullName() — queries t.repos (like repoName())
server/test/mcp-http.it.test.ts                  # NEW: inject app, hit the 3 routes (replaces mcp-reuse.it.test.ts)
```

### Docs
```
AGENTS.md            # @devdigest/mcp row updated → "thin HTTP client of the API (DEVDIGEST_API_URL)"
mcp-server/README.md # ~ replace "headless Container" run instructions with "start the API, set DEVDIGEST_API_URL"
mcp-server/.env.example # NEW: DEVDIGEST_API_URL (+ optional MCP_RUN_TIMEOUT_MS)
.mcp.json            # ~ env: { "DEVDIGEST_API_URL": "http://localhost:3001" } (drop DATABASE_URL / keys)
```

> **Deliberately not touched:** `server/src/vendor/shared/**`, `client/**`, `server/src/db/migrations/**`, and the already-shipped v1 repository/service seams. No new contracts in vendored shared.

## 6. Ordered task checklist (R8 — HTTP pivot)

> v1 tasks T1–T17 are **done** (in-process server shipped). The list below is the
> migration. Server routes (Slice A′) and MCP client (Slice B′) are parallel; only
> the IT/verify tasks bridge them.

- [ ] **R1 [SERVER]** `reviews/routes.ts`: `POST /reviews/run-sync` — body `{ repo, pr, agent }` (Zod). Handler: `resolveTargets({agentId:agent})` → `resolvePullRef(repo,pr)` → `runReview` → `race(runBus.onDone(runId), MCP_RUN_TIMEOUT_MS)` → `runOutcome(runId)`; timeout → `{ status:'running', run_id }`. `NotFoundError` → 404 with actionable message. Tight `rateLimit` like `/pulls/:id/review`. *Reuse only — no new service logic.*
- [ ] **R2 [SERVER]** `reviews/routes.ts`: `GET /runs/:id/outcome` → `service.runOutcome(workspaceId, id)`; undefined → `NotFoundError` "run not found — run an agent first". *Dep: none beyond v1.*
- [ ] **R3 [SERVER]** `conventions/{routes,service,repository}.ts`: `GET /conventions?repo=owner/name` → `ConventionsService.listByRepoFullName`, backed by a new `ConventionsRepository.findRepoIdByFullName` (queries `t.repos`); unknown repo → `NotFoundError` (404) actionable. *In-module resolution — onion forbids importing `reviews/service` here.*
- [ ] **R4 [TEST-IT]** `server/test/mcp-http.it.test.ts` (replaces `mcp-reuse.it.test.ts`, keeping its service-seam asserts): build the Fastify app, `app.inject` the 3 routes — `/runs/:id/outcome` (done + 404), `/conventions?repo=` (list + 404), and run-sync **error paths** (unknown agent → `/list_agents/`; unimported repo → `/isn't imported/`). The run-sync **done/timeout** happy path stays covered by the MCP unit tests + the executor path in `reviews.it.test.ts` (a real `done` run here needs a fully reviewable seeded PR — out of scope for this seam test). `overrides.secrets` stub; no real LLM. *Dep: R1–R3.*
- [ ] **R5 [MCP]** `http-client.ts` (replaces `composition.ts`): read `DEVDIGEST_API_URL` (default `http://localhost:3001`); typed `fetch` client implementing `ToolDeps` — `listAgents`, `runSync(repo,pr,agent)`, `getOutcome(runId)`, `getConventions(repo)`. No DB/Container/keys. *Dep: none.*
- [ ] **R6 [MCP]** `index.ts`: build the HTTP client instead of `buildDeps()`; drop SIGINT/SIGTERM DB-close (nothing to close); keep `StdioServerTransport`. Delete `composition.ts`. *Dep: R5.*
- [ ] **R7 [MCP]** `errors.ts`: map transport failures to "leads onward" text — `ECONNREFUSED`/fetch-fail → "DevDigest API not reachable at $DEVDIGEST_API_URL — start it with ./scripts/dev.sh"; 404 → pass through the server's actionable body; 5xx → "API error, check server logs". *Dep: R5.*
- [ ] **R8 [MCP]** `package.json`: remove the in-process-only deps (drizzle-orm, postgres, octokit, openai, @anthropic-ai/sdk, p-queue, js-tiktoken, simple-git, graphology*, @ast-grep/napi, @vscode/ripgrep, dependency-cruiser). `tsconfig.json`: drop `@server/*` runtime aliases, keep `@devdigest/shared`. Drop `lint:arch` script if depcruise removed. *Dep: R6.*
- [ ] **R9 [TEST-UNIT]** `tools/__tests__/*`: existing fakes mock `ToolDeps` → tools unchanged, should stay green. Add `http-client.test.ts` mocking global `fetch` (happy + ECONNREFUSED + 404). *Dep: R5–R7.*
- [ ] **R10 [DOCS+CONFIG]** `mcp-server/README.md`: replace "headless Container / needs DB+keys" with "start the API, set `DEVDIGEST_API_URL`". Add `mcp-server/.env.example`. `.mcp.json`: set `env.DEVDIGEST_API_URL`, drop DB/keys. `AGENTS.md`: note MCP is an HTTP client. *Dep: R5.*

## 7. Skills per task

| Task(s) | Skills |
|---|---|
| R1–R3 (new HTTP routes) | fastify-best-practices, onion-architecture, zod, typescript-expert, security |
| R4 (server IT test) | typescript-expert, zod, security, drizzle-orm-patterns |
| R5, R6 (HTTP client + composition) | typescript-expert, onion-architecture, security |
| R7 (transport error mapping) | typescript-expert, security |
| R8 (deps/tsconfig prune) | typescript-expert |
| R9 (MCP unit tests, mock fetch) | typescript-expert, zod, security |
| R10 (docs/config) | mermaid-diagram (optional, README flow diagram) |

No `client/**` files are touched → UI skills do not apply.

> v1 skill mapping (T1–T17, in-process build) retained in git history; the table
> above governs the R8 pivot.

## 8. File ownership (parallel, non-overlapping slices — R8)

### Slice A′ — server HTTP routes · `[SPAWN]`
**Owns:** `server/src/modules/reviews/routes.ts`, `server/src/modules/conventions/{routes,service,repository}.ts`, `server/test/mcp-http.it.test.ts`. **Tasks:** R1–R4.
- Reviews routes are **thin** — call existing `service.ts:46–134` methods; the synchronous wait (`runBus.onDone` race vs timeout) lives in the `/reviews/run-sync` handler (mirror the SSE generator's `onDone` usage already in this file). Conventions add a tiny in-module name→id lookup (one repository method + one service method) rather than cross into `reviews/service`. No inline Drizzle in routes.
- Onion guard: routes → service only (`server/INSIGHTS.md:29`/`:34`); run `pnpm lint:arch`.

### Slice B′ — MCP → HTTP client · `[SPAWN]`
**Owns:** all `mcp-server/**`. **Tasks:** R5–R10.
- `http-client.ts` replaces `composition.ts`: `DEVDIGEST_API_URL` (default `http://localhost:3001`) → global `fetch` client implementing `ToolDeps`. **No `@server/*` imports, no DB, no Container, no provider keys.**
- Keep `@devdigest/shared` alias (types only): `McpFinding = Finding.pick({ severity, category, title, file, start_line, end_line, suggestion })`; `Verdict` from `contracts/findings.ts`.
- `tools/*.ts`, `server.ts`, `contracts/*`, `pagination.ts` are **agnostic to transport** (they depend on `ToolDeps`) → should not change. The pivot is isolated to composition + errors + package manifest.
- Blast stub unchanged (`changed_symbols`, `callers`, `impacted_endpoints`).

### Slice C′ — docs/config · `[INLINE]`
**Owns:** root `AGENTS.md` note, `mcp-server/README.md`, `.mcp.json` env. **Task:** R10 (docs portion). Orchestrator edits; do not spawn.

> Slices A′ and B′ never touch the same file and can run fully in parallel — B′ mocks `fetch` in tests, so it does not need A′'s routes to land first. Only R4 (server IT) and §12 end-to-end bridge them.

## 9. Per-tool specification

Common: every tool returns MCP **structured content** validated by an `outputSchema`; errors return an `isError` result whose text **leads onward** (next tool/step). Pagination: `{ items, next_cursor: string | null }`; cursor is opaque base64 of an offset.

### 9.1 `list_agents` — read-only
- **Args:** `cursor?: string`, `limit?: number` (default 20, max 100).
- **Output:** `{ agents: [{ id, name, description }], next_cursor: string|null }` — high-signal only.
- **Calls (R8):** `GET /agents` → slice by cursor client-side.
- **Annotations:** `readOnlyHint: true`, `openWorldHint: false`.

### 9.2 `run_agent_on_pr(repo, pr, agent)` — the only write tool
- **Args (flat scalars):** `repo: string ("owner/name")`, `pr: number`, `agent: string`.
- **Output (discriminated by `status`):** done/failed → `{ status, run_id, verdict, score, summary, findings: McpFinding[], error }`; timeout → `{ status:'running', run_id, message }`.
- **Calls (R8):** single `POST /reviews/run-sync { repo, pr, agent }`. The server-side handler does `resolveTargets({ agentId })` → `resolvePullRef(repo, pr)` → `runReview` → `runBus.onDone` race vs `MCP_RUN_TIMEOUT_MS` (default 120 000) → `runOutcome(runId)` and returns the outcome (or `{ status:'running', run_id }`). MCP just maps the JSON.
- **Errors (actionable):** unknown agent → "agent not found — call list_agents to get a valid agent id"; repo/PR not imported → "repo … PR #… isn't imported yet — add the repo and sync its PRs in the studio first"; provider/diff failure → `status:'failed'` with run's `error` (run still persisted, readable via `get_findings`).
- **Annotations:** `destructiveHint: true`, `openWorldHint: true`.

### 9.3 `get_findings(run_id, cursor?, limit?)` — read-only
- **Output:** `{ status, verdict, score, summary, findings: McpFinding[], next_cursor }`.
- **Calls (R8):** `GET /runs/:run_id/outcome` → `RunOutcomeDto`; paginate findings client-side.
- **Errors:** unknown run → "run not found — run an agent first with run_agent_on_pr"; running/failed → returns `status` with empty findings (not an error).
- **Annotations:** `readOnlyHint: true`, `openWorldHint: false`.

### 9.4 `get_conventions(repo)` — read-only
- **Output:** `{ repo, conventions: [{ rule, evidence_path, confidence, accepted }] }` (subset of `ConventionCandidate`).
- **Calls (R8):** `GET /conventions?repo=owner/name` (server's `listByRepoFullName` resolves the id in-module, then lists). Read-only — does **not** trigger extraction.
- **Errors:** unknown repo → "repo not imported — add it in the studio"; empty → `{ repo, conventions: [] }` + hint "no conventions extracted yet".
- **Annotations:** `readOnlyHint: true`, `openWorldHint: false`.

### 9.5 `get_blast_radius(repo, pr)` — STUB (experimental)
- **Output:** `{ status:'not_implemented', repo, pr, message, changed_symbols: [], callers: [], impacted_endpoints: [] }`.
- **Behavior now:** `not_implemented` + message "blast radius is not implemented yet; planned to wire to repo-intel getBlastRadius".
- **Future wiring (code comment):** `resolvePullRef(repo, pr)` → `getPrFiles(prId)` → `container.repoIntel.getBlastRadius(repoId, changedFiles)` → map `BlastResult`.
- **Annotations:** `readOnlyHint: true`, `openWorldHint: true`, experimental in description.

## 10. Shared Zod contracts — where they live

- **Reused from `@devdigest/shared` (imported, not redefined):** `Finding`, `Verdict`, `Severity`, `FindingCategory` (`contracts/findings.ts`), `Agent` (`knowledge.ts:176`), `ConventionCandidate` (`:144`).
- **New, package-local (NOT in vendored shared):** `mcp/src/contracts/common.ts` + `tools.ts`. MCP transport shapes, not shared with client. `McpFinding = Finding.pick({...})`. Export both schema and inferred type.

## 11. Test plan

- **Unit (hermetic, `mcp-server/`):** one test per tool, injecting a fake `ToolDeps` (plain object) — no DB, no transport, no HTTP. Cover: `list_agents` pagination (cursor round-trip, null at end); `run_agent_on_pr` happy path (done + findings), unknown-agent error, timeout → `{ run_id, status:'running' }`; `get_findings` unknown-run + running states; `get_conventions` empty hint; `get_blast_radius` → `not_implemented`. **R8 adds `http-client.test.ts`:** mock global `fetch` — assert URL/verb/body per method, JSON mapping, and that `ECONNREFUSED`/404/5xx surface as actionable errors (R7).
- **Integration (DB-backed, `server/test/mcp-http.it.test.ts`):** testcontainers pgvector, seed repo+PR+agent, build the Fastify app (`overrides.secrets = { get: async () => undefined }`) and `app.inject` the **3 new routes**. Asserts `GET /runs/:id/outcome` (done + 404), `GET /conventions?repo=` (list + 404), and `POST /reviews/run-sync` **error paths** (unknown agent, unimported repo → actionable 404s). Also keeps the direct service-seam asserts (`resolveRepoId`/`resolvePullRef`). The run-sync `done`/`running` mapping is covered by the MCP unit tests; the executor path by `reviews.it.test.ts`. Self-skips without Docker.

## 12. Verification

Prereqs (R8): **the API must be running** — it owns the DB, keys and review
executor. MCP needs only `DEVDIGEST_API_URL`.
```sh
# 0. bring up the full stack (Postgres + migrated + seeded + API on :3001)
./scripts/dev.sh        # (or: docker compose up -d && cd server && pnpm db:migrate && pnpm db:seed && pnpm dev)

# 1. server routes (the 3 new HTTP seams)
cd server && pnpm typecheck && pnpm lint:arch && pnpm exec vitest run .it.test

# 2. mcp package — now NO DB/keys, just the client
cd ../mcp-server && pnpm install && pnpm typecheck && pnpm test && pnpm build

# 3. end-to-end over stdio (manual) — Inspector against the API
cd ../mcp-server && DEVDIGEST_API_URL=http://localhost:3001 npx @modelcontextprotocol/inspector pnpm dev
#   devdigest_list_agents {}                              → pick an agent id
#   devdigest_get_conventions { repo:"acme/payments-api" }→ conventions (or empty hint)
#   devdigest_run_agent_on_pr { repo:"acme/payments-api", pr:482, agent:"<id>" } → { verdict, findings[] } (or {run_id})
#   devdigest_get_findings { run_id:"<id>" }              → same concise outcome, paginated
#   devdigest_get_blast_radius { repo:"acme/payments-api", pr:482 } → { status:"not_implemented", ... }

# 4. API-down behavior: stop the API, call any tool → actionable
#   "DevDigest API not reachable at http://localhost:3001 — start it with ./scripts/dev.sh"
```
Acceptance: all typecheck/test/lint green; each tool returns schema-valid structured content; unknown-agent/unknown-repo return actionable errors; **API-down returns the reachability hint, not a stack trace**; stub returns `not_implemented`. Seed data: `acme/payments-api`, PR #482, two built-in agents (`server/README.md:109`).

## 13. Risks / do-not-touch

- **R8: API must be up.** MCP is no longer self-sufficient — every tool fails if
  the API is down. Mitigation: `errors.ts` returns the actionable
  "start it with ./scripts/dev.sh" hint (R7); document the dependency in the README.
- **R8: no auth header.** `LocalNoAuthProvider` makes the API accept
  unauthenticated localhost calls, so MCP sends none. This is fine for
  local-first, but **assumes the API binds to localhost only**. If real auth/multi-
  workspace lands, MCP must forward a token — out of scope, flag it.
- **R8: long synchronous request.** `/reviews/run-sync` can hold the HTTP
  connection up to `MCP_RUN_TIMEOUT_MS` (120 s). Ensure the route sets
  `rateLimit` and that Fastify/`undici` client timeouts on the MCP side exceed it
  (set the `fetch` timeout to `MCP_RUN_TIMEOUT_MS + a margin`, or none).
- **R8: dropped deps.** Removing drizzle/postgres/octokit/etc. from
  `mcp-server/package.json` — verify nothing in `tools/*` or `contracts/*` still
  imports them transitively (`pnpm typecheck` + `pnpm build` catch it).
- `server/src/db/migrations/**` — regenerate-only; this plan adds no migrations.
- `*/vendor/shared/**` — do-not-touch; reused via alias. A future shared field needs editing **both** copies — out of scope.
- Onion lint — Slice A keeps Drizzle in the repository layer; run `pnpm lint:arch`.
- In-process execution & shared `runBus` singleton — close DB handle on SIGINT/SIGTERM; always `off`/clear timer in a `finally` so the timeout never leaks the `onDone` listener.
- Secrets/keys — `run_agent_on_pr` needs a provider key + GitHub token; absent keys surface as a `failed` run with actionable `error`, not a crash.
- **Verified in the codebase (R8 reuse points):**
  - Service seams already exist: `resolveRepoId` (`service.ts:70`), `resolvePullRef` (`:77`), `runOutcome` (`:89`), `resolveTargets` (`:46`), `runReview` (`:135`); `RunOutcomeDto`/`toRunOutcomeDto` (`helpers.ts:61,71`). R8 routes only call them.
  - `runBus.onDone` already drained by the SSE route in `reviews/routes.ts` — mirror that listener for the `/reviews/run-sync` wait.
  - Local no-auth confirmed: `getContext` → `currentWorkspace` ignores the request (`adapters/auth/local.ts:28`) → MCP HTTP calls need no token.
  - API port = `API_PORT` default **3001** (`config.ts:29`) → `DEVDIGEST_API_URL` default `http://localhost:3001`.

## 14. Implementer contract

- Read this plan + cited `file:line` reuse points + the module's `INSIGHTS.md` before editing.
- One task at a time, in order; respect deps (Slice B′ mocks `fetch`, so it does not need Slice A′'s routes first; only R4 + §12 e2e bridge them).
- Invoke the linked Skills (§7) before editing each file type.
- Stay inside your slice's files (§8); never edit the other slice's files.
- After each task: Slice A′ → `cd server && pnpm typecheck && pnpm lint:arch` (+ `vitest run .it.test` once R4 lands); Slice B′ → `cd mcp-server && pnpm typecheck && pnpm test`.
- Do not edit vendored shared, migrations, or commit without approval. `pr-self-review` still runs at commit.

## Open items to confirm (R8)
1. **Sync wait location** — confirmed: keep create→wait→collect server-side in
   `POST /reviews/run-sync` (not client polling). This is what lets MCP drop its
   DB/keys; the in-memory `runBus` only exists in the API process anyway.
2. `DEVDIGEST_API_URL` default `http://localhost:3001` (the API's `API_PORT`).
   Set it in `.mcp.json` `env`. OK?
3. `MCP_RUN_TIMEOUT_MS` now lives **server-side** (the route's wait), default
   120 s; the MCP `fetch` timeout must exceed it. Acceptable?
4. Keep the 3 new routes **unauthenticated** (relies on `LocalNoAuthProvider`) —
   acceptable for local-first MVP?
5. Should `./scripts/dev.sh` also boot the MCP server, or stays manually launched
   by the coding-agent's MCP config (`.mcp.json`)? (Plan assumes the latter.)
