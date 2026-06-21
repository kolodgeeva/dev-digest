---
name: frontend-architecture
description: "Frontend/UI architecture and code organization for the DevDigest client (Next.js App Router + React). Use when deciding WHERE code should live — folder structure, where to put a component/constant/util/hook, how to split a component, where business logic belongs, colocation vs shared. Trigger phrases: \"where should this go\", \"folder structure\", \"how to split this component\", \"feature folder\", \"utils vs helpers\", \"business logic location\", \"colocation\"."
user-invocable: false
metadata:
  version: 1.0.0
---

# Frontend Architecture & Code Organization

How to organize the DevDigest client (`client/src/`): **where code lives, how to split it,
and which direction dependencies flow.** This skill is about *placement and structure only*.

- For React patterns (hooks, derived state, memoization, a11y) → use `react-best-practices`.
- For Next.js runtime patterns (RSC boundaries, data fetching, metadata) → use `next-best-practices`.
- For type-level decisions → use `typescript-expert`.

Detailed annotated folder map: [structure.md](./structure.md). Sources & rationale: [README.md](./README.md).

## The one rule that decides everything: colocate first, promote on reuse

**Put code as close as possible to where it is used. Move it up only when a second consumer appears.**

```
Used by ONE route/feature?      → colocate inside that route segment (app/<route>/_components, _lib)
Used by TWO+ routes?            → promote to a shared top-level folder (components/, lib/)
Used everywhere / app-wide?     → top-level shared (lib/, components/, i18n/)
```

Premature shared abstractions are the most common mistake. Duplicate once before extracting
(AHA — Avoid Hasty Abstractions). A "reusable" helper with one caller is just indirection.

## Dependency direction (enforced mental model)

Code flows **one way**. Lower layers never import from higher ones:

```
lib  →  components  →  app (routes/features)
```

- `lib/` (utils, hooks, clients) imports nothing from `components/` or `app/`.
- Shared `components/` import from `lib/`, never from a specific route under `app/`.
- A route in `app/` composes `components/` + `lib/`; it does NOT import from a *sibling* route.
- **Never import across feature routes.** If two routes need the same thing, promote it to shared.

## Folder structure (this repo)

```
client/src/
├── app/                      # Next.js App Router — routing + per-route (feature) code
│   └── <route>/
│       ├── page.tsx          # makes the route public; thin — composes components + hooks
│       ├── layout.tsx        # shared shell for the segment
│       ├── _components/      # route-private components (not routable)
│       │   └── <Name>/       # PascalCase folder: Name.tsx (+ hooks/helpers/types colocated)
│       └── _lib/             # route-private helpers/queries/actions (optional)
├── components/               # SHARED components reused across routes (grouped by area)
├── lib/                      # SHARED utils, clients, config
│   └── hooks/                # SHARED hooks reused across routes
├── i18n/                     # next-intl setup + messages
└── vendor/                   # DO NOT EDIT — vendored shared contracts + ui (edit at source)
```

- Anything under `app/<route>/` prefixed with `_` is **private**: safely colocated, never routable.
- A route becomes public only when it has a `page.tsx` (or `route.ts`). Colocating other files is safe.
- Use `(group)` route groups only to share a layout / organize routes **without** changing the URL.

## Splitting components

- **One component per file.** Filename = component name (PascalCase). Small private sub-components
  colocated in the same folder are fine; promote to `components/` only on reuse.
- **Split when:** the file grows past ~200 lines, a piece is reused, or a block has its own
  clear responsibility. Don't split a component you'll only ever render in one place into many files.
- **Container vs presentational:** keep data/logic (queries, mutations, derived state) in a
  container or, preferably, a **custom hook**; keep the presentational component pure (props in → UI out).
- **Props are a smell gauge:** many props (>5–7) usually means the component does too much — split it
  or pass `children` / composition instead of drilling props.

## Where each kind of code goes

| Kind | Where | Rule |
|------|-------|------|
| Route-private component | `app/<route>/_components/<Name>/` | default home for new UI |
| Shared component | `client/src/components/<area>/` | only after 2nd consumer |
| **Constants** | colocated next to use; promote to `lib/` or a feature `*.constants.ts` when shared | enum-like, copy, config values |
| **Pure utils** | `lib/` (shared) or `_lib/` (route) | no side effects, no I/O — input → output only |
| **Business logic** | custom hook (`lib/hooks/` or route `_lib`) or `lib/` service | NEVER in the component body |
| **Data access / I/O** | `lib/` client/service or Next.js Server Action in `_lib` | talking to the outside world |
| Shared hook | `lib/hooks/` | reused across routes; client-side |
| Types | colocated `*.types.ts`; shared types in `lib/`/`vendor/shared` | reuse contracts from `vendor/shared` |

### utils vs helpers vs services (naming discipline)

- **utils** = small, generic, **pure** functions (format date, parse, clamp). Reusable anywhere, no state, no I/O.
- **helpers** = project/feature-specific glue; colocate with the feature, don't globalize.
- **services / clients** = code that *does* something with the outside world (API calls, business rules).
  Lives in `lib/`; this is where side effects belong — not in `utils`.

If a "util" has side effects, it isn't a util — it's a service. Name it accordingly and move it.

## Next.js App Router specifics

- Keep `page.tsx` / `layout.tsx` **thin**: they wire routing and compose; logic lives in `_components`/`_lib`.
- Use `_private` folders to separate UI/logic from routing and avoid future naming conflicts.
- Client/server boundary should be visible in the filesystem: hooks/stores are client-side;
  data access, validation, and Server Actions belong in `lib`/`_lib` (server side).
- Don't reach across route segments — compose shared pieces at the layout/page level instead.

## Review checklist

- [ ] New code lives at the lowest layer that uses it (colocated unless reused).
- [ ] No imports from a sibling route; no `components/`→`app/` or `lib/`→`components/` imports.
- [ ] `page.tsx`/`layout.tsx` are thin; logic is in hooks/`_lib`, not component bodies.
- [ ] Each component is one file; no >200-line components; props count is sane.
- [ ] `utils` are pure; anything with I/O lives in a service/client under `lib/`.
- [ ] No premature shared abstraction (single-consumer "shared" code).
