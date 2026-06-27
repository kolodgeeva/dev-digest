# Reference: Annotated Layer Map

Detailed companion to [SKILL.md](./SKILL.md). Read this when you need the full layout and the
reasoning behind each location. Anchored to this repo's real conventions (`server/src/`).

## Full annotated tree

```
server/src/
│
├── server.ts                         # process entrypoint (listen)
├── app.ts                            # Fastify assembly: plugins → modules → error handler
│
├── modules/                          # FEATURES — each module is its own onion
│   │
│   ├── index.ts                      # static registry: one import + one entry per module
│   ├── _shared/                      # cross-module code (the only "shared module")
│   │   ├── context.ts                #   getContext() — tenancy/workspace resolution
│   │   └── schemas.ts                #   shared route param schemas (IdParams, …)
│   │
│   └── agents/                       # ◀ reference module — clean 3-layer onion
│       ├── routes.ts                 # PRESENTATION  — Zod schemas, getContext, calls service
│       ├── service.ts                # APPLICATION   — use cases; calls repo + ports; DTOs
│       ├── repository.ts             # INFRASTRUCTURE— the ONLY place Drizzle lives
│       ├── types.ts                  # DOMAIN        — pure types
│       ├── constants.ts              # DOMAIN        — pure constants
│       └── helpers.ts                # DOMAIN        — pure functions (toAgentDto, predicates)
│   # reviews/ uses repository/*.repo.ts (sub-repos) + a run-executor — see anti-patterns
│
├── adapters/                         # PORTS' IMPLEMENTATIONS (infrastructure edge)
│   ├── llm/ (openai, anthropic)      #   implement LLMProvider
│   ├── github/ · git/ · codeindex/   #   implement GitHubClient · GitClient · CodeIndex
│   ├── secrets/ · auth/ · embedder/  #   implement SecretsProvider · AuthProvider · Embedder
│   ├── index.ts                      #   adapter barrel
│   └── mocks.ts                      #   mock adapters for tests
│
├── platform/                         # COMPOSITION ROOT + cross-cutting
│   ├── container.ts                  #   DI container — wires adapters → services (knows all)
│   ├── errors.ts                     #   AppError hierarchy (NotFoundError, …)
│   └── jobs.ts · sse.ts · config.ts  #   job runner · SSE bus · config
│
├── db/                               # PERSISTENCE
│   ├── schema.ts / schema/           #   Drizzle tables (imported ONLY by repositories)
│   ├── client.ts                     #   Db type / connection
│   ├── rows.ts                       #   row types
│   └── migrations/                   #   DO-NOT-EDIT — generated via `pnpm db:generate`
│
└── vendor/shared/                    # DO-NOT-TOUCH — vendored Zod contracts + PORT INTERFACES
                                      #   (LLMProvider, GitClient, …) — edit at source
```

## Decision table — "where does this file go?"

| You are adding… | Put it in… | Promote when… |
|-----------------|------------|---------------|
| An HTTP endpoint | `modules/<name>/routes.ts` | — |
| Request/response schema | route Zod schema, or `_shared/schemas.ts` | reused by 2+ modules → `_shared` (or `vendor/shared`) |
| A use case | `modules/<name>/service.ts` | — |
| A pure business rule / mapper | `modules/<name>/helpers.ts` | reused → `_shared` |
| A DB query | `modules/<name>/repository.ts` | grows large → split into `repository/<area>.repo.ts` |
| An external call | `service.ts` via `container.<port>` | — |
| A new external integration | `adapters/<area>/` + wire in `platform/container.ts` | — |
| A constant for one module | `modules/<name>/constants.ts` | shared → `_shared` |
| A shared type/contract | reuse from `vendor/shared` | never duplicate; edit at source |
| Something two modules need | `modules/_shared/` or `platform/` | never import a sibling module |

## Layer rules (recap)

```
        imports allowed  ↓ (inner can't import outer)
routes.ts     ── may import ──▶  service, _shared, platform/errors, vendor/shared
service.ts    ── may import ──▶  repository, domain (helpers/types), container (ports), vendor/shared
domain        ── may import ──▶  vendor/shared, pure libs only
repository    ── may import ──▶  drizzle-orm, db/schema, db/client, vendor/shared
adapters      ── may import ──▶  external SDKs (implement port interfaces)
container.ts  ── composition root ──▶  may import everything (wires it together)
```

- ❌ `repository` / `repository/*.repo.ts` importing `routes` or `service`
- ❌ `service.ts` importing `drizzle-orm` or `db/*` (go through the repository)
- ❌ `routes.ts` importing `drizzle-orm` or `db/*` (call a service) — *current debt, warn*
- ❌ `types/constants/helpers` importing Fastify, Drizzle, adapters, or `db/*`
- ❌ `modules/a` importing `modules/b/*` — promote the shared piece to `_shared`
- ✅ Wire concrete adapters only in `platform/container.ts`

## Naming conventions (this repo)

- Module layers: `routes.ts` · `service.ts` · `repository.ts` (or `repository/<area>.repo.ts`).
- Domain: `types.ts` · `constants.ts` · `helpers.ts` (pure).
- Adapters: `adapters/<area>/<impl>.ts` (e.g. `llm/openai.ts`) implementing a `@devdigest/shared` port.
- Mappers in `helpers.ts` named `to<Thing>Dto` (row → DTO).
- Modules are registered statically in `modules/index.ts`.

## Anti-patterns to flag in review

- Drizzle / `db/*` imported in `routes.ts` (DB-in-route) — route should call a service.
- A "service" with inline Drizzle or raw SQL — push it into the repository.
- A fat orchestrator mixing diff-loading + LLM + persistence + streaming (`reviews/run-executor.ts`).
- `helpers/constants/types` that import Fastify, Drizzle, an adapter, or perform I/O.
- `Schema.parse(req.body)` hand-rolled in a handler instead of a route Zod schema.
- A sibling-module import (`modules/a` → `modules/b`) instead of promoting to `_shared`.
- A concrete adapter class imported into a service instead of the port via `container`.
