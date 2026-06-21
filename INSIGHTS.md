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
- 2026-06-21 · antipattern · Can't smoke-test a `PreToolUse` Bash hook whose matcher keys on a substring (e.g. `git commit`) by piping a fake event through the Bash tool — your *own* test invocation's command string contains that substring, so the live hook denies your Bash call before it runs. Put the test logic + the trigger string in a script file and run `bash /tmp/x.sh` (the outer command the hook sees is just `bash /tmp/x.sh`, which doesn't match). Evidence: `.claude/settings.json` PreToolUse hook added this session.

## Codebase Patterns
<!-- conventions, architectural decisions -->
- 2026-06-17 · codebase-pattern · Zod contracts in `*/vendor/shared/` have NO sync script — `server/src/vendor/shared/` and `client/src/vendor/shared/` are independent copies you must edit identically. Adding/removing one field = two edits (both `trace.ts`, both `platform.ts`, …). Precedent: commit d45ab0d edited both `trace.ts` copies in one go. Forgetting one side compiles in that package but fails the other's typecheck/`.parse`.
- 2026-06-21 · codebase-pattern · `.claude/skills/README.md` preamble claims a `.cursor/skills/ → ../.claude/skills` symlink exists for Cursor — it does NOT (no `.cursor/` dir in the repo). Skills are picked up from `.claude/skills/` directly. If Cursor compatibility is wanted, create the symlink (`ln -s ../.claude/skills .cursor/skills`); don't assume it's there. New skill added this session: `.claude/skills/frontend-architecture/` (code-placement/folder-structure; SKILL.md + structure.md + README.md), registered in the catalog table. Its scope is deliberately disjoint from `react-best-practices` (hooks/perf) and `next-best-practices` (RSC/data) — keep those boundaries when editing any of the three.

## Tool & Library Notes
<!-- dependency quirks/gotchas -->
- 2026-06-21 · tooling · Root `CLAUDE.md` is a symlink to `AGENTS.md` (`readlink -f CLAUDE.md` → `AGENTS.md`). The Edit/Write tools refuse to write through a symlink — edit `AGENTS.md` directly. (Per-package `server/CLAUDE.md` etc. are real files.)
- 2026-06-21 · tooling · New `pr-self-review` skill + commit gate added this session. `git commit` is blocked by a `PreToolUse` hook in `.claude/settings.json` until a pass flag `/tmp/claude-pr-selfreview-<diffhash>` exists; the skill (`/pr-self-review`) writes that flag only when 0 CRITICAL findings. Flag is keyed to a hash of `git diff $(git merge-base main HEAD)` — NOT session id — because the hook reads `.session_id` from stdin JSON while the skill's Bash env has no reliable matching session var; diff-hash keying also forces re-review whenever code changes. The skill routes changed files to existing skills by path (UI→frontend-architecture/next/react, server→onion/fastify/drizzle/pg, all→typescript-expert/zod/security). To bypass during an authorized commit, create the flag for the current diff hash.
- 2026-06-21 · tooling · CORRECTION to the `pr-self-review` note above. Two changes after first use: (1) **Scope is now local changes vs the current branch tip `HEAD`** (staged + unstaged + untracked), NOT vs `main` — committed branch work isn't re-reviewed. (2) **The fingerprint is computed through a throwaway index**, not `git diff <merge-base>`. The old hash excluded untracked files, so a new file slipped past review AND `git add`-ing it shifted the hash → guaranteed one "blocked" cycle on every new file. Fix (same in both skill Step 1/5 and the hook): `tmp=$(mktemp); GIT_INDEX_FILE="$tmp" git read-tree HEAD; GIT_INDEX_FILE="$tmp" git add -A; h=$(GIT_INDEX_FILE="$tmp" git diff --cached HEAD | shasum | cut -d' ' -f1); rm -f "$tmp"`. This is staging-invariant (verified) and includes untracked files. The real index is never touched (temp `GIT_INDEX_FILE`).

## Recurring Errors & Fixes
<!-- repeated error + its fix -->

## Session Notes
<!-- datestamped session summaries -->

## Open Questions
<!-- what's still unresolved -->
