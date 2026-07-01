# DevDigest

Local-first AI pull-request review. **This is a map, not documentation** — it loads
into every session. Module-specific rules live in each package's `AGENTS.md`; deep
detail stays in the README/docs linked under "Read when".

## Session insights (compounding memory)
- **Before working in a package, read its `INSIGHTS.md`** (`server/`, `client/`,
  `reviewer-core/`, `e2e/`, or root for cross-cutting). Treat entries as
  high-confidence guidance unless told otherwise;
  confirm you've read it and summarize the top relevant points before starting.
- **At end of a non-trivial session, run `/engineering-insights`** to append what you
  learned. Don't skip this — append-only, never overwrite. See
  `.claude/skills/engineering-insights/SKILL.md`.

## Stack
- Node ≥22 · pnpm ≥10 · Docker (Postgres only)
- **server**: Fastify 5 · Drizzle ORM · Postgres + pgvector · Zod · ESM (`"type":"module"`)
- **client**: Next.js 15 · React 19 · TanStack Query · Tailwind 4 · next-intl
- **reviewer-core**: pure review engine (diff → prompt → LLM → findings)
- Tests: Vitest everywhere

## Commands
```sh
./scripts/dev.sh          # Postgres + API(:3001) + web(:3000) from zero
./scripts/e2e.sh          # browser e2e (real stack, no LLM)
```
Per-package (`server/`, `client/`): `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build`
server only: `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`

## Where things live
| Package | Path | What |
|---------|------|------|
| `@devdigest/api` | `server/` | Fastify API, features in `server/src/modules/*` |
| `@devdigest/web` | `client/` | Next.js, routes in `client/src/app/*` |
| `@devdigest/reviewer-core` | `reviewer-core/` | review engine + grounding gate |
| `@devdigest/mcp` | `mcp-server/` | local MCP server (stdio) — thin HTTP client of the API (`DEVDIGEST_API_URL`); 5 `devdigest_*` tools |
| `@devdigest/e2e` | `e2e/` | deterministic browser tests |
| `@devdigest/shared` | `*/vendor/shared` | Zod contracts (vendored in server **and** client) |

`repo-intel` (codebase indexer → repo map = review context) lives in `server/src/modules/repo-intel`.

## Project-wide conventions
- **Never `git commit` (or push) without the user's explicit approval.** Make the
  edits, run the checks, show what changed — then wait. Only commit when asked.
- **PR self-review gate.** Before committing, `git commit` is blocked by a `PreToolUse`
  hook until `pr-self-review` passes for the current diff; run `/pr-self-review` (or it
  runs on demand) — any `CRITICAL` finding blocks the commit. See
  `.claude/skills/pr-self-review/SKILL.md`.
- **Not a monorepo workspace.** Each package has its own `package.json` + lockfile;
  cross-package code is shared via tsconfig path aliases, not published modules.
- **Tests split by filename**: `*.it.test.ts` = DB-backed (testcontainers Postgres);
  everything else is hermetic.
  Unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'` · IT only: `pnpm exec vitest run .it.test`
- Contracts are one Zod source shared across all packages.

## Gotchas
- **Migrations do NOT run on boot.** `relation ... does not exist` → run `cd server && pnpm db:migrate`.
- Only Postgres runs in Docker; API and web run on the host.
- pgvector is enabled by migration `0000` — make sure migrations ran against the Dockerized DB.
- Reset everything: `docker compose down -v`, then `./scripts/dev.sh`.
- Outbound calls go only to GitHub (PR data) and the LLM (via OpenRouter/OpenAI/Anthropic).

## Do-not-touch
- `*/vendor/shared/**` — vendored contracts; edit at the source, not the copies.
- `server/src/db/migrations/**` — generated via `pnpm db:generate` (drizzle-kit), never hand-edit.

## Read when
References are single source of truth — read the file, don't assume.
- **Read `server/README.md`** when working on API routes or module structure.
- **Read `client/README.md`** when working on UI routes or components.
- **Read `reviewer-core/README.md`** when changing the review pipeline or grounding gate.
- **Read `e2e/README.md`** when writing or debugging browser e2e flows.
- **Read `TESTING.md`** when changing test strategy or CI workflows.
- **Read `docs/agent-prompts/`** when editing reviewer system prompts or model choice.
- Project Skills (Drizzle, Fastify, Next, React, Zod, security) load on their own — follow them.
