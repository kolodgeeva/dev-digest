# INSIGHTS — root (cross-cutting)

Append-only notes the previous session leaves for the next — engineering insights
that don't belong to a single package (project-wide conventions, cross-package
decisions, tooling that spans server+client). Per-package insights go in that
package's own `INSIGHTS.md`. Maintained by the `engineering-insights` skill — see
`.claude/skills/engineering-insights/SKILL.md`.

**How to use:** don't overwrite; correct a stale entry with a dated note referencing
the old one. Each entry: `YYYY-MM-DD · category · insight · evidence (file:line)`.
Write it actionable and "cold" — readable with zero session context.

**Maintenance:** prune fixed/obsolete entries monthly; resolve contradictions
explicitly; split into domain files (e.g. `INSIGHTS-ci.md`) past ~200 entries. This
is a draft under human spot-check — committed to git.

## What Works
<!-- approaches & solutions that worked -->

## What Doesn't Work
<!-- dead ends & antipatterns — the most-skipped, most-valuable section; fill it -->

## Codebase Patterns
<!-- conventions, architectural decisions -->
- 2026-06-17 · codebase-pattern · Zod contracts in `*/vendor/shared/` have NO sync script — `server/src/vendor/shared/` and `client/src/vendor/shared/` are independent copies you must edit identically. Adding/removing one field = two edits (both `trace.ts`, both `platform.ts`, …). Precedent: commit d45ab0d edited both `trace.ts` copies in one go. Forgetting one side compiles in that package but fails the other's typecheck/`.parse`.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->

## Recurring Errors & Fixes
<!-- repeated error + its fix -->

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
