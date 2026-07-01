# @devdigest/mcp

Local-first **MCP server** for DevDigest (package dir: `mcp-server/`). Exposes the
review tools to an external coding agent (Claude Code, Cursor, …) over **stdio**.

It is a thin **HTTP client of the running DevDigest API** (`DEVDIGEST_API_URL`,
default `http://localhost:3001`). The MCP process holds **no database connection,
no Container, and no provider keys** — the review runs inside the API process,
where the DB and keys already live.

The API exposes only **general-purpose, id-keyed endpoints**; the HTTP client
(`src/http-client.ts`) does any **multi-step orchestration** behind the
`ToolDeps` methods — the tools themselves stay thin. `run_agent_on_pr` resolves
`owner/name` + PR number to ids (`GET /repos`, `GET /repos/:id/pulls`), starts
one run (`POST /pulls/:id/review`), then **polls** `GET /runs/:id/outcome` until
it is terminal — there is no bespoke MCP aggregate endpoint on the server.

It is **not** a published module and imports no `@server/*` runtime — the only
borrowed types are the `@devdigest/shared` contracts (erased at compile time).

## Tools

All tools are namespaced `devdigest_*`, snake_case, with per-field `.describe()`
input schemas and explicit annotations.

| Tool | Kind | HTTP call → returns |
|------|------|-----------------|
| `devdigest_list_agents` | read-only | `GET /agents` → reviewer agents `{ id, name, enabled, model }` (paginated). Get a valid `agent` id here. |
| `devdigest_run_agent_on_pr(repo, pr, agent)` | **write** | Orchestrates `GET /repos` + `GET /repos/:id/pulls` → `POST /pulls/:id/review` → poll `GET /runs/:id/outcome` → `{ status, verdict, score, summary, findings[] }`. The only write tool. Flat args. On timeout → `{ status: "running", run_id }`. |
| `devdigest_get_findings(run_id, response_format?)` | read-only | `GET /runs/:id/outcome` → `concise` (default) = verdict + summary + per-severity counts; `detailed` = full findings, paginated. |
| `devdigest_get_conventions(repo)` | read-only | Resolves the repo id, then `GET /repos/:id/conventions` → the repo's vetted house conventions (L02). Lists extracted rules; does not trigger extraction. |
| `devdigest_get_blast_radius(repo, pr)` | read-only | Resolves the PR id, then `GET /pulls/:id/blast` → the impact map (changed symbols → callers → endpoints) from the `repo-intel` index. Deterministic, no LLM. |

Design: flat scalar args; the tools do the multi-step orchestration; concise
structured results (high-signal fields only); cursor-based pagination; errors
**lead onward** (e.g. API down → "start it with ./scripts/dev.sh"; unknown repo →
"add it in the studio first").

## Run from scratch

The MCP server talks to the API, so **bring the full stack up first** — it owns
the DB, the keys, and the review executor.

### 1. Start the API (+ DB)

```sh
# from the repo root — Postgres + migrate + seed + API on :3001:
./scripts/dev.sh
```

Seed data: repo `acme/payments-api`, PR #482, three built-in agents. Keys (a
provider key + `GITHUB_TOKEN`, only needed for a real `run_agent_on_pr`) live in
the **API's** config/secrets — not here.

### 2. Install MCP deps & point it at the API

```sh
cd mcp-server && pnpm install
cp .env.example .env   # optional — defaults to http://localhost:3001
```

### 3. Run / test — pick one

**A. MCP Inspector (manual, recommended).** MCP speaks stdio, so use the Inspector UI:

```sh
DEVDIGEST_API_URL=http://localhost:3001 pnpm inspect
```

Then **List Tools** (5 `devdigest_*`) and call, in order:

```jsonc
devdigest_list_agents       {}
devdigest_get_conventions   { "repo": "acme/payments-api" }
devdigest_get_blast_radius  { "repo": "acme/payments-api", "pr": 482 }
devdigest_run_agent_on_pr   { "repo": "acme/payments-api", "pr": 482, "agent": "<id from list_agents>" }
devdigest_get_findings      { "run_id": "<id from run>", "response_format": "detailed" }
```

**B. Register with an MCP client (real use).**

```sh
claude mcp add devdigest --env DEVDIGEST_API_URL=http://localhost:3001 \
  -- pnpm --dir /abs/path/to/dev-digest/mcp-server dev
# then /mcp in the session; tools appear as devdigest_*
```

**C. Automated checks (no DB, no API).**

```sh
pnpm typecheck && pnpm test
```

### Behavior when the API is down

Every tool fails fast with an actionable error rather than a stack trace:

> `Cannot reach DevDigest API at http://localhost:3001 — start it with ./scripts/dev.sh`

### Config & gotchas

| Env | Default | Description |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | DevDigest API base URL. Validated at startup — the server exits if it is not a valid URL. |
| `MCP_RUN_TIMEOUT_MS` | `120000` | How long `run_agent_on_pr` polls `GET /runs/:id/outcome` before returning `{ status: "running", run_id }` for the caller to fetch later. |

- The local API uses `LocalNoAuthProvider`, so the MCP sends **no auth header**
  (assumes the API binds to localhost). If real auth lands, the MCP must forward a token.
- stdout is the MCP channel — **all logs go to stderr** (`[devdigest-mcp] ready on stdio → <url>`).
- empty `list_agents` → the API DB isn't seeded (`cd server && pnpm db:seed`).
- Stop with `Ctrl-C`. The MCP holds no DB handle; Postgres/API keep running.

## Develop

```sh
pnpm typecheck     # tsc
pnpm test          # vitest — hermetic unit tests (fake ToolDeps / mocked fetch, no DB, no network)
```

The tools depend on a narrow `ToolDeps` port, so the tool unit tests pass
plain-object fakes and never touch the network or the SDK transport. The
multi-step orchestration lives in the HTTP client (`src/http-client.ts`) and is
tested by mocking global `fetch` and routing by `METHOD path` (resolve → POST
review → poll outcome). The general-purpose endpoints it reaches (`GET /repos`,
`GET /repos/:id/pulls`, `POST /pulls/:id/review`, `GET /runs/:id/outcome`,
`GET /pulls/:id/blast`, `GET /repos/:id/conventions`) live in
`server/src/modules/*`; `server/test/mcp-http.it.test.ts` covers the run outcome
read.
```
