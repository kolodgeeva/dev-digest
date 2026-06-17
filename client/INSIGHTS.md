# INSIGHTS — client (@devdigest/web)

Append-only notes the previous session leaves for the next, scoped to the Next.js
web app. Maintained by the `engineering-insights` skill — see
`.claude/skills/engineering-insights/SKILL.md`.

**How to use:** don't overwrite; correct a stale entry with a dated note referencing
the old one. Each entry: `YYYY-MM-DD · category · insight · evidence (file:line)`.
Write it actionable and "cold" — readable with zero session context.

**Maintenance:** prune fixed/obsolete entries monthly; resolve contradictions
explicitly; split into domain files (e.g. `INSIGHTS-routing.md`) past ~200 entries.
This is a draft under human spot-check — committed to git.

## What Works
<!-- approaches & solutions that worked -->
- 2026-06-17 · convention · Money/cost display renders "—" for null (unknown model / failed run), NEVER "$0.00" — a missing price must be visually distinct from a genuine zero. A priced-zero run (free model) shows a real "$0.0000". Single source: `client/src/lib/format-cost.ts` (`formatCost`).

## What Doesn't Work
<!-- dead ends & antipatterns — the most-skipped, most-valuable section; fill it -->
- 2026-06-17 · antipattern · Don't bury a formatter used by multiple route segments inside a feature's `_components/.../helpers.ts`. `formatCost` is needed by both the PR list (`pulls/`) and the run trace/timeline (`pulls/[number]/`) — cross-segment relative imports (`../[number]/.../helpers`) are ugly and brittle. Put shared formatters in `client/src/lib/` and import via `@/lib/...`. Single-use ones (formatTokens/formatSeconds) correctly stay local to the trace drawer.

## Codebase Patterns
<!-- conventions, architectural decisions -->
- 2026-06-17 · codebase-pattern · Adding a PR-list table column = 3 edits that MUST stay in sync (`client/src/app/repos/[repoId]/pulls/`): append the key to `COLUMN_KEYS` (constants.ts), add a matching width to `GRID` (constants.ts — column count must equal width count), and insert the cell in `_components/PRRow/PRRow.tsx` at the SAME ordinal position. The header auto-renders by mapping `COLUMN_KEYS` → i18n `list.columns.<key>` in page.tsx; add that message key too.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->

## Recurring Errors & Fixes
<!-- repeated error + its fix -->

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
