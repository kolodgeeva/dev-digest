---
name: onion-architecture
description: "Backend architecture & code organization for DevDigest server modules (Fastify + Drizzle + DI/ports). Use when deciding WHERE backend code lives and which way dependencies flow — routes vs service vs repository, where business logic / DB access / external calls belong, ports & adapters, module boundaries. Trigger phrases: \"where should this go\", \"onion architecture\", \"clean architecture\", \"service vs repository\", \"layering\", \"dependency direction\", \"ports and adapters\", \"business logic location\", \"module structure\"."
user-invocable: false
metadata:
  version: 1.0.0
---

# Onion Architecture & Backend Code Organization

How to organize the DevDigest server (`server/src/`): **where backend code lives, which
layer owns it, and which direction dependencies flow.** This skill is about *placement,
layering, and dependency direction only*.

- For Fastify route mechanics (hooks, schema providers, error handling) → use `fastify-best-practices`.
- For Drizzle queries inside the repository layer → use `drizzle-orm-patterns`.
- For request/response contracts → use `zod` (contracts live in `vendor/shared`).
- For type-level decisions → use `typescript-expert`.

Detailed annotated layout: [structure.md](./structure.md). Sources & rationale: [README.md](./README.md).

## The one rule that decides everything: dependencies point inward

**Coupling is toward the center. An inner layer never imports an outer one.**

```
   outer ─────────────────────────────────────▶ inner   (imports allowed →)
   routes.ts  →  service.ts  →  domain  →  ports  →  (DI wires infra in)
 presentation   application    (types/    (interfaces
                               helpers)    in @devdigest/shared)
```

Concretely, per module `server/src/modules/<name>/`:

| Layer | File(s) | May import | Must NOT import |
|-------|---------|------------|-----------------|
| **Presentation** | `routes.ts` | `service`, `_shared`, `platform/errors`, `@devdigest/shared` | Drizzle, `db/*`, another module |
| **Application** | `service.ts` | `repository`, domain, the DI `Container` (ports) | Drizzle/`db/*` directly, `routes` |
| **Domain (core)** | `types.ts`, `constants.ts`, `helpers.ts` | `@devdigest/shared`, pure libs | Fastify, Drizzle, `adapters/*`, `db/*` |
| **Infrastructure** | `repository.ts`, `repository/*.repo.ts` | Drizzle, `db/schema`, `db/client` | `routes`, `service` (anything outward) |
| **Ports & adapters** | `adapters/*`, `platform/container.ts` | concrete SDKs (implementations) | — (composition root knows all) |

The **port interfaces** (`LLMProvider`, `GitClient`, `GitHubClient`, `SecretsProvider`, …)
live in `@devdigest/shared`; `adapters/*` are the implementations; `platform/container.ts`
is the **composition root** — the one place allowed to wire concrete adapters to modules.
Services depend on the *interface* via the container, never on a concrete adapter class.

## Layer responsibilities (what each one may and may not do)

- **routes.ts (presentation)** — declare Zod `params`/`body` schemas, resolve tenancy via
  `getContext`, call **one** service method, shape the HTTP reply. No business rules, no DB.
- **service.ts (application)** — orchestrate a use case: validate intent, call the repository
  and ports (`container.llm`, `container.github`, …), map rows to DTOs (`helpers`). Thin.
  No Drizzle, no Fastify types, no raw SQL.
- **domain (types/constants/helpers)** — pure types, enums, copy, and pure functions
  (mappers, predicates). No I/O, no side effects. Reusable, framework-free.
- **repository.ts (infrastructure)** — the **only** place Drizzle/Postgres lives. Pure
  data access; takes a `Db`, returns rows. No business decisions, no HTTP.
- **adapters + container (ports)** — adapters wrap external SDKs behind the interfaces in
  `@devdigest/shared`; the container constructs them lazily and injects them into services
  so tests can swap mocks (`adapters/mocks.ts`).

## Folder structure (this repo)

```
server/src/
├── server.ts                 # entrypoint
├── app.ts                    # Fastify assembly (plugins → modules → error handler)
├── modules/                  # FEATURES — one onion per module
│   ├── index.ts              # static module registry (one import + entry each)
│   ├── _shared/              # cross-module helpers (context, schemas) — promote here
│   └── <name>/
│       ├── routes.ts         # presentation
│       ├── service.ts        # application / use cases
│       ├── repository.ts     # infrastructure (Drizzle)  [or repository/*.repo.ts]
│       ├── types.ts          # domain types
│       ├── constants.ts      # domain constants
│       └── helpers.ts        # domain pure functions (DTO mappers, predicates)
├── adapters/                 # PORTS' implementations: llm, github, git, secrets, …
│   └── mocks.ts              # mock adapters for tests
├── platform/                 # composition root + cross-cutting
│   ├── container.ts          # DI container (wires adapters → services)
│   └── errors.ts, jobs.ts, sse.ts, …
└── db/                       # schema, client, migrations, rows  (DO NOT hand-edit migrations)
```

Eluding the layers is the mistake. The cleanest reference module is `modules/agents/`
(routes → thin service → pure-Drizzle repository). Use it as the template.

## Where each kind of code goes

| You are adding… | Layer | File | Rule |
|-----------------|-------|------|------|
| An HTTP endpoint | presentation | `routes.ts` | declare Zod schema; call one service method |
| Request validation | presentation | `routes.ts` (Zod) | never hand-roll `Schema.parse(req.body)` — use the schema provider |
| A use case / orchestration | application | `service.ts` | calls repository + ports; returns DTOs |
| A business rule / derived value | domain or application | `helpers.ts` (pure) or `service.ts` | pure → `helpers`; needs I/O → `service` |
| A DB read/write | infrastructure | `repository.ts` | the only place Drizzle/`db/*` appears |
| An external call (LLM, GitHub, git) | port via DI | `service.ts` → `container.<port>` | behind an interface in `@devdigest/shared` |
| A new external integration | adapter | `adapters/<area>/` | implement the port interface; wire in `container.ts` |
| A type/contract | domain | `types.ts` or `@devdigest/shared` | reuse vendored contracts; don't duplicate |
| A constant | domain | `constants.ts` | promote to `_shared` only on 2nd module |
| Something two modules need | shared | `modules/_shared/` or `platform/` | never import a sibling module |

### service vs repository vs adapter (naming discipline)

- **service** = application orchestration. Coordinates a use case; holds no SQL and no SDK
  calls inline — it *delegates* to the repository and to ports.
- **repository** = the single doorway to the database. Drizzle lives here and nowhere else.
- **adapter** = an implementation of an external-world port (LLM/GitHub/git/secrets). Lives
  in `adapters/`, hidden behind an interface so it can be mocked.

If a "service" imports Drizzle, it isn't a service — push the query into the repository.
If a "util/helper" performs I/O, it isn't domain — it's an adapter or repository method.

## Module boundaries

- Each module is a self-contained Fastify plugin, registered statically in `modules/index.ts`.
- **Never import across sibling modules** (`modules/a` → `modules/b`). If two modules need the
  same thing, promote it to `modules/_shared`, `platform`, or an adapter behind a port.
- Only the **composition root** (`platform/container.ts`) may reach into modules to wire them.

## Anti-patterns to avoid (and how they're caught)

- **DB-in-route** — Drizzle/`db/*` imported in `routes.ts` (current debt: settings, workspace,
  polling, pulls). Route should call a service. → `route-no-direct-db` (warn).
- **Fat orchestrator** — one class mixing diff-loading, LLM calls, persistence, and event
  streaming (e.g. `reviews/run-executor.ts`). Split concerns; keep persistence in the repository.
- **Inline Drizzle in service** — query straight from `service.ts`. → `app-no-direct-db` (error).
- **Manual body parsing** — `RunRequest.parse(req.body)` in a handler instead of a route Zod
  schema (`fastify-type-provider-zod`). Declare the schema; let the provider reject with 422.
- **Domain reaching out** — `helpers/constants/types` importing Fastify/Drizzle/adapters. → `domain-stays-pure` (error).
- **Cross-module coupling** — importing a sibling's `routes/service/repository`. → `no-cross-module-coupling` (error).

## Enforcement (this is forced, not just advice)

Rules are codified in `server/.dependency-cruiser.cjs` and run via:

```sh
cd server && pnpm lint:arch
```

**error** rules break the build (inward-only violations, inline-DB in service, impure domain,
cross-module coupling). **warn** rules flag documented debt (DB-in-route, a stray cross-module
constants import). Add `pnpm lint:arch` to CI alongside `pnpm typecheck`.

## Review checklist

- [ ] New code sits in the right layer; imports point inward only.
- [ ] `routes.ts` declares a Zod schema and calls one service method — no Drizzle, no business rules.
- [ ] `service.ts` has no Drizzle/`db/*` import and no Fastify types; external calls go through `container.<port>`.
- [ ] All DB access lives in `repository.ts` / `*.repo.ts`.
- [ ] `types/constants/helpers` are pure (no Fastify, Drizzle, adapters, I/O).
- [ ] No sibling-module import; shared code promoted to `_shared`/`platform`/an adapter.
- [ ] `pnpm lint:arch` passes (0 errors) and `pnpm typecheck` is green.
