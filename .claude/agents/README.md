# Agents

Custom Claude Code subagents for DevDigest. Each agent is a single `*.md` file:
YAML frontmatter (`name`, `description`, `tools`, `model`, optional `skills`) + an
English system-prompt body. Claude routes to an agent by its `description`, so each
description states **when to use** and **when NOT to use** it.

These agents are designed to compose into a **research → plan → implement → verify →
document** pipeline, mirroring Anthropic's orchestrator-workers pattern. The writer
(`test-writer`, `doc-writer`) and reviewer (`architecture-reviewer`, `plan-verifier`)
roles are kept separate from the implementer so each has a single, narrow remit:

```
researcher ──(facts, prior art)──┐
                                 ▼
        planner ──> .claude/plans/<slug>.md ──> implementer ×N (parallel slices)
                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          ▼                           ▼                           ▼
                  test-writer            architecture-reviewer / plan-verifier   doc-writer
              (authors the tests)         (review the diff, no edits)        (documents it)
```

## Catalog

| Agent | Model | Tools | Role |
|---|---|---|---|
| [`researcher`](researcher.md) | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch | Read-only investigator — finds facts in the codebase **and** on the web, returns a structured, source-cited report. Never edits. |
| [`planner`](planner.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch, Write, Skill | Builds a structured **Development Plan** before any code is written. Module-aware, folds in INSIGHTS.md, assigns skills per task, partitions work into non-overlapping file-ownership slices. Writes only `.claude/plans/<slug>.md`. |
| [`implementer`](implementer.md) | sonnet | Read, Grep, Glob, Bash, Edit, Write, Skill | Implements **one slice** of a plan (backend or UI), in parallel with other implementers on the same branch. Applies the right skills per file type, reads module INSIGHTS.md just-in-time, makes tests pass. Self-reviews only its own diff. |
| [`test-writer`](test-writer.md) | sonnet | Read, Grep, Glob, Bash, Edit, Write, Skill | Authors automated tests for backend (Fastify + Drizzle + Vitest) **and** frontend (Next.js + React + RTL + Vitest). Typological not exhaustive; mocks only at boundaries. Runs the right test lane and iterates until green. |
| [`architecture-reviewer`](architecture-reviewer.md) | sonnet | Read, Grep, Glob, Bash, Skill | Read-only review of layering — onion (backend) and frontend dependency direction — scoped strictly to the current diff. Flags `CRITICAL`/`WARNING`/`SUGGESTION`; cites and recommends, never edits. |
| [`plan-verifier`](plan-verifier.md) | sonnet | Read, Grep, Glob, Bash | Read-only requirements-traceability: did the change implement every task in `.claude/plans/<slug>.md`? Emits a `COVERED`/`PARTIAL`/`MISSING` table with `file:line` evidence. Caller must name the slug. |
| [`doc-writer`](doc-writer.md) | sonnet | Read, Grep, Glob, Bash, Edit, Write, Skill | Documents already-built functionality and converts plans/specs into well-placed docs with Mermaid diagrams. Cites `file:line` before any claim; never edits the documented code. |

---

## `researcher`

Read-only research across the project codebase and the web. Returns a structured,
honest report and states loudly when something was **not** found — a confident wrong
answer is the worst outcome. Has no Edit/Write/Agent tools by design; Bash is limited to
read-only inspection. Use for "find out…", "research…", "where in the code…", "is there
prior art for…".

## `planner`

Turns a feature request into a single, machine-consumable Development Plan that one or
more `implementer`s execute. Key design points:

- **Plan is a persistent artifact** on disk (`.claude/plans/<slug>.md`), not just
  context — so it survives truncation and is the single source of truth for executors.
- **Module-aware**: reads root + per-package `AGENTS.md`, knows every package and the
  `server/src/modules/*` layout, respects do-not-touch paths.
- **Hybrid insights (planning-time half)**: folds relevant `INSIGHTS.md` lessons into
  the matching plan tasks.
- **Assigns skills per task**, reusing the canonical "file path → skills" routing table
  from `pr-self-review/SKILL.md`, each skill rendered as a link to its `SKILL.md`. The
  planner's `skills:` preload is a **superset** of the implementer's (full backend + UI
  + cross-cutting set, plus `mermaid-diagram`) because it must reason over the full
  content of every skill the implementer will use.
- **Non-overlapping file-ownership slices** so parallel implementers never collide on a
  shared branch.
- Read-only except for the plan file; never edits production code.

## `implementer`

Executes one slice of a plan. Narrow and concrete: **write the slice's code and make
the tests pass.** Key design points:

- **Stays strictly inside its slice's owned files**; if it needs a file outside the
  slice, it stops and reports rather than editing (another implementer owns it).
- Runs on **the branch it was launched on**, in the shared working tree (no worktree
  isolation) — collisions are prevented by the plan's non-overlapping ownership.
- **Skill routing per file type** via the same table as `pr-self-review` (backend skills
  on `server/**`, UI skills on `client/**`, cross-cutting on all), invoked through the
  `Skill` tool before editing.
- **Hybrid insights (just-in-time half)**: reads a module's `INSIGHTS.md` before working
  there.
- **Self-check**: `pnpm typecheck` + unit tests (`--exclude '**/*.it.test.ts'`); IT
  tests only when the task genuinely touches the DB.
- **Light self-review of its own diff only** — it is NOT the quality gate. The project's
  `pr-self-review` still runs at commit time (PreToolUse hook).

## `test-writer`

Authors automated tests for **both** stacks — backend (Fastify + Drizzle + Vitest) and
frontend (Next.js + React + RTL + Vitest). Does not change production code except where a
test seam genuinely requires it. Key design points:

- **Typological, not exhaustive** (per `TESTING.md`): one happy path plus the one edge
  that matters; skips tests that wouldn't catch a real regression class.
- **Respects the repo test split**: `*.it.test.ts` = DB-backed (testcontainers Postgres,
  `server/test/helpers/pg.ts`); everything else hermetic. Defaults to the unit lane and
  reaches for the IT lane only when a repository/DB path is the thing under test.
- **Backend** uses `buildApp({config, db, overrides})` + `app.inject()` with mock
  adapters from `server/src/adapters/mocks.ts`; **frontend** uses `vi.mock`,
  `NextIntlClientProvider`, `userEvent.setup()`, role/label queries.
- **Skill routing per file type** via the same canonical table as `implementer` /
  `pr-self-review`, applied to the files it tests.
- **Hard anti-pattern guardrail**: forbids over-mocking (mocking the subject under test,
  mocking own modules/hooks/context), snapshot tests, `fireEvent`,
  `container.querySelector`, and tautological assertions. Mocks only at boundaries.
- **Self-check loop**: runs the affected package's lane, iterates a bounded number of
  times, and stops + reports if not green.

## `architecture-reviewer`

Read-only reviewer of **structure**, not bugs. Checks onion-architecture dependency
direction on the backend and `lib → components → app` direction on the frontend. Key
design points:

- **Read-only by design** (no Edit/Write/Agent; Bash limited to inspection, like
  `researcher`) — it cites `path:line` and recommends, never rewrites code.
- **Diff-scoped**: only flags lines in the current change (staged + unstaged + untracked
  vs HEAD via the same throwaway-index technique as `pr-self-review`); never flags
  pre-existing debt outside the diff.
- **Severity vocabulary is `CRITICAL` / `WARNING` / `SUGGESTION`** (mirrors
  `server/src/vendor/shared/contracts/findings.ts`) — never Claude's built-in
  Important/Nit.
- Output is a findings list (severity, citation, violated rule + skill, concrete
  recommendation) plus a by-severity summary, with an explicit "no architectural issues
  in this diff" path when clean.

## `plan-verifier`

Read-only **requirements-traceability** against a Development Plan — answers "was each
task actually built?", nothing about quality or architecture (that's
`architecture-reviewer`). Key design points:

- **Caller must name the plan slug** (`.claude/plans/<slug>.md`); with none given it lists
  `.claude/plans/` and asks rather than assuming a default.
- Parses the plan's task checklist (§6), file-ownership (§8), and acceptance criteria
  (§9), enumerating every task as a row.
- **Three-level check** per task: L1 file exists, L2 substantive (not a stub/TODO), L3
  wired (imported/registered/exported/called).
- Output is a traceability table with `COVERED` / `PARTIAL` / `MISSING` status and a
  `file:line` evidence cite for every COVERED row; **any MISSING is blocking**.
- **Honest**: distinguishes "verified absent" from "couldn't check" and never marks
  COVERED without evidence. Minimal toolset (no `Skill`/Edit/Write) — pure traceability.

## `doc-writer`

Documents **already-implemented** functionality and converts Development/Implementation
Plans + given artifacts into well-placed docs. Does not change the documented code. Key
design points:

- **Grounded**: reads source and cites `file:line` before any claim; never writes from
  memory (same honesty bar as `researcher`).
- **Placement decision table**: package how-to → `<package>/docs/<topic>.md`; feature
  spec / converted plan → `<package>/specs/` or `docs/specs/` (per
  `docs/specs/conventions.md`); cross-cutting → `docs/<topic>.md`; reviewer prompts →
  `docs/agent-prompts/`.
- **Diátaxis**: keeps tutorial / how-to / reference / explanation types separate.
- **Mermaid via [`../skills/mermaid-diagram/SKILL.md`](../skills/mermaid-diagram/SKILL.md)**:
  sequence for request flows, ER for schema, flowchart for module structure, etc.
- **Do-not-clobber list**: never overwrites `INSIGHTS.md`, `AGENTS.md`, `CLAUDE.md`,
  `.claude/skills/**`, `.claude/agents/**`, `.claude/plans/**`, `*/vendor/shared/**`, or
  `server/src/db/migrations/**` — it creates or appends.

---

## Conventions for adding/editing agents

- **Body in English**; the agent replies in the language of the request (matches
  `researcher.md`).
- **Explicit `tools` allowlist** — don't inherit everything; omit `Agent` unless the
  agent must spawn subagents.
- **`description` is the router** — say when to use AND when not to use.
- **Skill links are relative** as `../skills/<name>/SKILL.md` (resolves correctly from
  both `.claude/agents/` and `.claude/plans/`, since both sit under `.claude/`).
- **Do NOT use `paths:` frontmatter on skills** to auto-scope them — it's bugged
  (claude-code Issue #49835, makes the skill undiscoverable). Route file→skill via a
  table in the agent's prompt body instead.
- The canonical file→skill routing table lives once in
  [`../skills/pr-self-review/SKILL.md`](../skills/pr-self-review/SKILL.md); `planner` and
  `implementer` embed copies. Change all three in lockstep.

## Sources & best practices applied

Design grounded in the following (verified this session):

- **Claude Code docs** — [sub-agents](https://code.claude.com/docs/en/sub-agents),
  [skills](https://code.claude.com/docs/en/skills),
  [worktrees](https://code.claude.com/docs/en/worktrees),
  [best practices](https://code.claude.com/docs/en/best-practices): frontmatter schema,
  `description`-based delegation, tool allowlists, model routing, `skills:` preload,
  writer/reviewer separation.
- **Anthropic — [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)**:
  orchestrator-workers pattern, transparency through explicit planning steps,
  environmental feedback loops.
- **Anthropic — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)**:
  plan persisted to memory, detailed task boundaries to avoid duplicated work, clean
  context handoffs to workers.
- **claude-code [Issue #49835](https://github.com/anthropics/claude-code/issues/49835)**:
  the `paths:` skill-frontmatter bug → route skills via the prompt body instead.
- **Internal precedents**: [`../skills/pr-self-review/SKILL.md`](../skills/pr-self-review/SKILL.md)
  (canonical file→skill routing), [`researcher.md`](researcher.md) (agent shape),
  the per-package `INSIGHTS.md` / `AGENTS.md` convention (hybrid memory).
