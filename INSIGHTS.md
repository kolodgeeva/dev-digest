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
- 2026-06-21 · codebase-pattern · `.claude/skills/README.md` preamble claims a `.cursor/skills/ → ../.claude/skills` symlink exists for Cursor — it does NOT (no `.cursor/` dir in the repo). Skills are picked up from `.claude/skills/` directly. If Cursor compatibility is wanted, create the symlink (`ln -s ../.claude/skills .cursor/skills`); don't assume it's there. New skill added this session: `.claude/skills/frontend-architecture/` (code-placement/folder-structure; SKILL.md + structure.md + README.md), registered in the catalog table. Its scope is deliberately disjoint from `react-best-practices` (hooks/perf) and `next-best-practices` (RSC/data) — keep those boundaries when editing any of the three.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->

## Recurring Errors & Fixes
<!-- repeated error + its fix -->

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
