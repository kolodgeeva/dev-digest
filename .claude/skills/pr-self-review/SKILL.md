---
name: pr-self-review
description: "Review all open local changes before they are committed/merged. Reads the branch-vs-main + uncommitted diff, routes each changed file through the matching DevDigest skills (UI skills on client files, backend skills on server files, cross-cutting skills on all), and BLOCKS if any CRITICAL finding exists. Runs automatically before git commit (via PreToolUse hook) and on demand. Trigger phrases: \"self review\", \"check my changes\", \"review before merge\", \"pr self review\"."
allowed-tools: Bash, Read, Grep, Glob, Skill
metadata:
  version: 1.0.0
---

# PR Self-Review

Catch problems **locally, before code lands** by applying the project's own architecture and
best-practice skills to the actual diff. The gate is simple: **any `CRITICAL` finding blocks
the commit/merge.** This skill does not invent new rules — it routes changed files to the
skills that already encode our rules, and only reports what those rules flag.

Severity vocabulary matches the project contract `Severity = CRITICAL | WARNING | SUGGESTION`
(`server/src/vendor/shared/contracts/findings.ts:11`).

Run automatically before `git commit` (a `PreToolUse` hook in `.claude/settings.json` denies
the commit until a passing review exists for the exact current diff), or manually as
`/pr-self-review`.

## Procedure

### Step 1 — Compute the diff (all open changes)

```sh
base=$(git merge-base main HEAD)
git diff --name-only "$base"     # changed files: committed-on-branch + staged + working-tree
git diff "$base"                 # full unified diff to review
```

`git diff <merge-base>` (note: **no** `..HEAD`) compares the merge-base against the working
tree, so it captures committed-on-branch **and** uncommitted/staged edits in one pass.

If there are zero changed files, report "nothing to review" and PASS (write the flag, Step 5).

### Step 2 — Classify each changed file and apply the mapped skills

For every changed file, match it to the buckets below and apply each listed skill as a
**review lens**: read that skill's `SKILL.md` rules (invoke it via the `Skill` tool) and judge
the changed hunks against them. A file can match several buckets (e.g. a server route is both
`onion-architecture` and `typescript-expert` + `security`).

| Path pattern | Skills to apply |
|---|---|
| `client/src/**/*.{ts,tsx}` (non-test) | `frontend-architecture`, `next-best-practices`, `react-best-practices` |
| `client/**/*.{test,spec}.{ts,tsx}` | `react-testing-library` |
| `server/src/**/*.ts` (routes / services / modules) | `onion-architecture`, `fastify-best-practices` |
| `server/src/**/{schema,db}*.ts`, `*repository*.ts`, Drizzle schema/query files | `drizzle-orm-patterns`, `postgresql-table-design` |
| `reviewer-core/src/**/*.ts` | `typescript-expert`, `zod`, `security` |
| any changed `*.{ts,tsx}` | `typescript-expert` |
| files defining/using Zod schemas, or under `*/vendor/shared/contracts/**` | `zod` |
| every change (look for auth, routes, input handling, secrets, SQL/queries) | `security` |

**Hard CRITICAL flags (do-not-touch, per CLAUDE.md / package `CLAUDE.md`):**
- Any edit under `server/src/db/migrations/**` — must be regenerated via `pnpm db:generate`,
  never hand-edited.
- Any direct edit under `*/vendor/shared/**` — vendored contracts; edit at the source.

### Step 3 — Produce findings

For each issue, record: `severity` (`CRITICAL` / `WARNING` / `SUGGESTION`), `file:line`, the
violated rule **and which skill it came from**, a one-line rationale, and a suggested fix.

Grounding rule (mirrors the project's reviewer): a finding only counts if its line(s) appear
in the diff from Step 1. Don't flag code you didn't see change.

Severity guidance:
- `CRITICAL` — correctness/security bug, broken contract, or a do-not-touch / hard
  architecture-direction violation. **Blocks.**
- `WARNING` — real best-practice violation that should be fixed but doesn't break anything.
- `SUGGESTION` — nice-to-have / style / minor improvement.

### Step 4 — Gate

- **≥1 `CRITICAL`** → print all findings grouped by severity, then state clearly:
  **"BLOCKED: fix CRITICAL findings before committing/merging."** Do **not** write the pass
  flag. Stop.
- **0 `CRITICAL`** → print findings (WARNING/SUGGESTION are advisory). Write the pass flag
  (Step 5) and report **PASS**.

### Step 5 — Write the pass flag (lets the commit hook through)

Only on PASS. Key the flag to a hash of the reviewed diff so any later code change invalidates
it and forces a re-review:

```sh
h=$(git diff "$(git merge-base main HEAD)" | shasum | cut -d' ' -f1)
touch "/tmp/claude-pr-selfreview-$h"
```

The `PreToolUse` hook recomputes this same hash before each `git commit`; if the matching flag
exists the commit proceeds, otherwise it is denied with an instruction to run this skill.
