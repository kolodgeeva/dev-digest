# Reference: Annotated Folder Map

Detailed companion to [SKILL.md](./SKILL.md). Read this when you need the full layout and the
reasoning behind each location. Anchored to this repo's real conventions (`client/src/`).

## Full annotated tree

```
client/src/
│
├── app/                              # App Router. Folders = URL segments. Routing + feature code.
│   │
│   ├── layout.tsx                    # Root layout (html/body, providers, app shell). Thin.
│   ├── page.tsx                      # Home route. Composes components + hooks; no business logic.
│   │
│   ├── agents/                       # Feature route "/agents"
│   │   ├── page.tsx                  # Public route entry. Thin: fetch via hook + render view.
│   │   ├── _components/              # Route-private UI (underscore = never routable)
│   │   │   ├── AgentsListView/       # PascalCase folder per component
│   │   │   │   ├── AgentsListView.tsx
│   │   │   │   ├── useAgentsList.ts   # colocated hook (logic for THIS view only)
│   │   │   │   └── AgentsListView.types.ts
│   │   │   └── AgentCard/
│   │   │       └── AgentCard.tsx
│   │   ├── _lib/                     # Route-private helpers/queries/actions (optional)
│   │   │   └── agents.queries.ts
│   │   └── [id]/                     # Dynamic segment "/agents/:id"
│   │       ├── page.tsx
│   │       └── _components/          # Components private to the detail route
│   │
│   ├── onboarding/_components/...     # same colocation pattern per feature
│   ├── repos/[repoId]/pulls/...
│   └── settings/[section]/_components/...
│
├── components/                       # SHARED components — reused across 2+ routes
│   ├── app-shell/                    # grouped by area, not by route
│   ├── page-shell/
│   └── diff-viewer/
│
├── lib/                              # SHARED non-UI code (the bottom of the dependency graph)
│   ├── hooks/                        # SHARED hooks (client-side) reused across routes
│   ├── <client>.ts                   # API/HTTP clients, services (I/O lives here)
│   └── <util>.ts                     # pure utilities (no side effects)
│
├── i18n/                             # next-intl config + messages
│
├── test/                             # test utilities/setup
│
└── vendor/                           # DO-NOT-TOUCH (vendored; edit at source)
    ├── shared/                       # Zod contracts shared with server
    └── ui/                           # vendored UI primitives
```

## Decision table — "where does this file go?"

| You are adding... | Put it in... | Promote when... |
|-------------------|--------------|-----------------|
| A component used by one route | `app/<route>/_components/<Name>/` | a 2nd route needs it → `components/<area>/` |
| A component used by many routes | `components/<area>/` | — |
| A hook used by one view | colocated next to the component | reused → `lib/hooks/` |
| A hook used by many routes | `lib/hooks/` | — |
| A pure helper for one feature | `app/<route>/_lib/` | reused → `lib/` |
| A pure helper used app-wide | `lib/` | — |
| A constant for one component | top of that component's file / colocated `*.constants.ts` | shared → `lib/` |
| App-wide constants/config | `lib/` (e.g. `lib/config.ts`) | — |
| API call / data access | `lib/` client/service, or route `_lib` Server Action | — |
| A Zod contract | reuse from `vendor/shared` | never duplicate; edit at source |
| i18n message | `i18n/` messages | — |

## Layer rules (recap)

```
        imports allowed  ↓ (lower can't import upper)
app/<route>   ── may import ──▶  components/, lib/, vendor/
components/    ── may import ──▶  lib/, vendor/
lib/           ── may import ──▶  vendor/ (and external libs only)
```

- ❌ `lib/` importing from `components/` or `app/`
- ❌ `components/` importing from a specific `app/<route>/`
- ❌ `app/<routeA>/` importing from `app/<routeB>/` — promote the shared piece instead
- ✅ Compose features at the page/layout level

## Naming conventions (this repo)

- Component files & folders: **PascalCase** (`AgentCard/AgentCard.tsx`).
- Hooks: `useThing.ts` (camelCase, `use` prefix).
- Colocated siblings: `<Name>.types.ts`, `<Name>.constants.ts`, `<feature>.queries.ts`,
  `<feature>.actions.ts` (Server Actions).
- Route-private folders: `_components`, `_lib` (underscore = excluded from routing).
- Route groups: `(group)` — organizational only, omitted from the URL.

## Anti-patterns to flag in review

- A "shared" component/util/hook with exactly one consumer → inline or colocate it.
- Business logic, data fetching, or large derived computations inside `page.tsx` / a component body.
- `utils` that perform I/O or mutate external state → that's a service, move to `lib/`.
- Cross-route imports between sibling segments under `app/`.
- Deep prop drilling where `children`/composition would do.
- Components over ~200 lines or with >5–7 props doing multiple jobs.
