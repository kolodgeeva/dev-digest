# e2e — @devdigest/e2e

Deterministic browser end-to-end suite for the web app, driven by Vercel
**agent-browser** (native Rust + CDP). **No Playwright, no LLM, no API key.** Each
flow is a JSON list of agent-browser commands run in order against one shared
browser session by `run.ts`.

## Commands
`pnpm test` (`tsx run.ts`) · `pnpm e2e:hermetic` (`../scripts/e2e.sh`, full real stack) · `pnpm typecheck`

## Where things live
- `specs/*.flow.json` — ordered flows (app-boot, repo-pulls, agents, findings, diff, onboarding, settings)
- `run.ts` — runner · `lib/assert.ts` — assertion helpers

## Conventions
- Flows are deterministic — real stack, no LLM. Keep selectors stable; assert via `lib/assert.ts`.

## Read when
- **Read `e2e/README.md`** for how a flow works and the runner conventions.
- **Read `e2e/INSIGHTS.md`** before working here; append learnings via
  `/engineering-insights`, append-only.
