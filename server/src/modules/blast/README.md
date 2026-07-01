# blast — PR Blast Radius

Answers a reviewer's first question — *"what can these changes break?"* — that the diff alone
doesn't show. For a PR it surfaces:

1. **Changed symbols** — functions/declarations in the changed files,
2. **Downstream callers** — who imports/calls those symbols, each with a `file:line`,
3. **Impacted endpoints / crons** — HTTP routes and scheduled jobs reachable from those callers.

**Deterministic and token-free.** Nothing is parsed or sent to an LLM at request time — the data
is read from the `repo-intel` index already built at clone time. The service has **no `llm` /
`resolveAvailableLlm` import**; that absence is the zero-token guarantee (mirrors `smart-diff`).

## Routes

| Route | Caller | Resolves by |
|---|---|---|
| `GET /pulls/:id/blast` | the web UI (Overview panel) | internal PR id |
| `GET /blast?repo=owner/name&pr=N` | the MCP `devdigest_get_blast_radius` tool / external | repo full name + PR number |

Both return the same envelope and are workspace-scoped via `getContext` (tenancy gate is
`getPull` / `findRepoByFullName`). Unknown PR/repo → `404 NotFoundError` with actionable text.

## Response envelope

The vendored `BlastRadius` contract (`@devdigest/shared`) plus a `degraded` signal — defined inline
in `routes.ts` (`BlastRadius.extend({ degraded, reason })`) so the do-not-touch `vendor/` contracts
stay untouched (same pattern as `intent`):

```jsonc
{
  "changed_symbols": [{ "name": "rateLimit", "file": "src/api/rate.ts", "kind": "function" }],
  "downstream": [{
    "symbol": "rateLimit",
    "callers": [{ "name": "publicRouter", "file": "src/api/public/index.ts", "line": 23 }],
    "endpoints_affected": ["GET /api/public/items"],
    "crons_affected": ["reset-rate-buckets (hourly)"]
  }],
  "summary": "1 symbol(s) changed · 4 downstream caller(s) across 4 file(s) · 3 endpoint(s) impacted",
  "degraded": false,
  "reason": null
}
```

## Layering

`routes.ts` → `BlastService` → `container.reviewRepo` (changed files + PR/repo resolution) +
`container.repoIntel.getBlastRadius()` (the engine). No Drizzle in the service; `helpers.ts`
(`toBlastResponse`) is a pure mapper with no I/O. `BlastResult` (camelCase, flat callers,
`factsByFile`) → `BlastRadius` (snake_case, grouped by changed symbol) happens entirely in
`helpers.ts`.

- **Endpoint/cron attribution:** on the full (persistent) index path, `endpoints_affected` /
  `crons_affected` per symbol are the union of `factsByFile[callerFile]` over that symbol's caller
  files.
- **Degraded path:** when the index is incomplete the engine omits `factsByFile`; the mapper falls
  back to the flat `impactedEndpoints` union (no per-file attribution, no cron data) and sets
  `degraded: true` with a `reason` so the UI shows a "Partial index" badge instead of a blank panel.

## Files

- `routes.ts` — the two GET routes + inline `BlastResponseSchema`.
- `service.ts` — `BlastService.build(workspaceId, prId)` and `buildByRef(workspaceId, repo, pr)`.
- `helpers.ts` — `toBlastResponse(result)` (pure) + the `BlastResponse` type.
- `helpers.test.ts` — hermetic mapper tests. `../../test/blast.it.test.ts` — DB-backed route tests
  (inject a fake `repoIntel` + offline `secrets` to prove zero LLM calls).

## Engine

The heavy lifting lives in `server/src/modules/repo-intel` (`getBlastRadius(repoId, changedFiles)`),
served from Postgres (`symbols`, `references`, `file_edges`, `file_facts`, `file_rank`). Index
completeness is observable via `GET /repos/:id/index-state`.
