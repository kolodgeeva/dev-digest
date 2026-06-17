# server — @devdigest/api

Fastify 5 + Drizzle/Postgres. ESM (`"type":"module"`).

## Commands
`pnpm dev` (:3001, tsx watch) · `pnpm test` · `pnpm typecheck` · `pnpm build`
`pnpm db:migrate` · `pnpm db:seed` · `pnpm db:generate`

## Where things live
- `src/server.ts` — entrypoint · `src/app.ts` — Fastify assembly
- `src/modules/*` — features (agents, pulls, repos, reviews, settings, polling, workspace, **repo-intel**)
- `src/db/` — schema, migrations, seed · `src/adapters/`, `src/platform/`, `src/prompts/`

## Conventions
- Tests: `*.it.test.ts` = DB-backed (testcontainers); everything else is hermetic.
- Validation via Zod + `fastify-type-provider-zod`.

## Do-not-touch
- `src/vendor/shared/**` — vendored contracts.
- `src/db/migrations/**` — only via `pnpm db:generate`.

## Read when
- **Read `server/README.md`** for the full API map and module diagrams.
- **Read `server/INSIGHTS.md`** before working here; append learnings via
  `/engineering-insights`, append-only.
