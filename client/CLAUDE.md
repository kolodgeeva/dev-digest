# client — @devdigest/web

Next.js 15 (App Router) + React 19.

## Commands
`pnpm dev` (:3000) · `pnpm test` (vitest + jsdom) · `pnpm typecheck` · `pnpm build`

## Where things live
- `src/app/*` — routes (page.tsx, layout.tsx + settings, repos, agents, onboarding)
- `src/components/*` — UI (diff-viewer, app-shell, mermaid-diagram, …)
- `src/lib/hooks` — TanStack Query hooks · `src/i18n` — next-intl · `messages/` — locales

## Conventions
- Server data via TanStack Query, not raw fetch in components.
- i18n: strings go in `messages/`, never hardcode in JSX.
- Follow the React / Next / RTL Skills.

## Do-not-touch
- `src/vendor/**` — vendored UI + contracts.

## Read when
- **Read `client/README.md`** for the full UI route map.
- **Read `client/INSIGHTS.md`** before working here; append learnings via
  `/engineering-insights`, append-only.
