# Feature spec: Skills (reusable review skills)

> Status: **implemented** (branch `L02`). This document describes what is built
> in the code and serves as the feature contract. Source of truth for specifics
> is the code itself: `server/src/modules/skills/**`, `client/src/app/skills/**`,
> `server/src/db/schema/skills.ts`.

## 1. Goal

A **skill** is a reusable piece of review text (markdown) that can be linked to
multiple agents. A skill has no tool access — it is just `name + markdown body +
type + source`. During a review, the bodies of an agent's linked skills are
injected into the prompt's `## Skills / rules` slot.

Why: lift rules/rubrics/conventions out of an individual agent's config into a
shared, versioned, editable library — one skill, many agents.

## 2. Scope

1. **Storage** — a `skills` table (name, description, markdown body, type,
   source, `enabled`, `version`) + basic CRUD in Fastify.
2. **Linking** — agent ↔ skill relation (one agent → many skills, ordered). A
   **Skills** tab in the agent editor.
3. **Prompt injection** — at review time the bodies of linked (enabled) skills
   are added to the prompt as a dedicated block. The `skills` slot in
   `reviewer-core` **already existed** — the engine was ready from the start; we
   only feed it data.
4. **Import** — from a markdown file + from a community catalog (search,
   preview, one-click import). Imported/community bodies are **untrusted**:
   delimiter-wrapped on injection.
5. **UI** — a Skills page (list + editor) with **Config** and **Preview** tabs.

**Out of scope for this stage:** Evals / Stats / Versions tabs in the editor
(present in the mockup, not implemented); auto-extraction of skills from accepted
feedback (`source: 'extracted'` is reserved in the schema but has no UI/pipeline
yet).

## 3. Data model

`server/src/db/schema/skills.ts` + `agent_skills` in `schema/agents.ts`.

### `skills`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `workspace_id` | uuid FK → `workspaces` | `onDelete: cascade`; **everything is workspace-scoped** |
| `name` | text NOT NULL | |
| `description` | text NOT NULL | defaults to `''` (`DEFAULT_SKILL_DESCRIPTION`) |
| `type` | text enum | `rubric \| convention \| security \| custom` |
| `source` | text enum | `manual \| imported_url \| extracted \| community` |
| `body` | text NOT NULL | markdown |
| `enabled` | boolean NOT NULL | default `true` |
| `version` | integer NOT NULL | default `1`; bumps only on a `body` change |
| `evidence_files` | jsonb `string[]` | nullable (for the future `extracted` source) |
| `created_at` | timestamptz | |

### `skill_versions` (body history)
- PK `(skill_id, version)`; `skill_id` FK → `skills` `onDelete: cascade`.
- A `body` snapshot is written on create (v1) and on every body change.
- Metadata-only edits (name/description/type/enabled) do **not** bump the version.

### `agent_skills` (the link)
- PK `(agent_id, skill_id)`; both FKs `onDelete: cascade`.
- `order` (integer) — the order skills are injected into the prompt.
- Owned by the **agents repository** (`agents.linkedSkills`), not the skills module.

## 4. API

Module `server/src/modules/skills/` (routes → service → repository); the
workspace is resolved via `getContext`. Validation is Zod.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/skills` | list (workspace-scoped) |
| `GET` | `/skills/catalog` | community-catalog cards (read-only, no bodies) |
| `GET` | `/skills/:id` | one skill (404 if absent) |
| `POST` | `/skills` | create (`source: 'manual'`) → 201 |
| `PUT` | `/skills/:id` | update / toggle `enabled` (body change → new version) |
| `DELETE` | `/skills/:id` | delete (cascades versions + links) |
| `POST` | `/skills/import` | import from catalog (`{catalog_id}`) **or** markdown (`{body}`) |
| `GET`/`POST` | `/agents/:id/skills` | read / replace the ordered set of links (`{skill_ids}`) |

- `/skills/import` body: a `.refine` requires either `catalog_id` **or** `body`.
- Static paths (`/catalog`, `/import`) live alongside the parametric `/:id` —
  Fastify's router prioritizes static matches.
- The catalog is **bundled reference data** (`COMMUNITY_CATALOG` in
  `constants.ts`), not a DB table and not workspace-scoped. Cards carry no
  `body`; the body is materialized only on import.

## 5. Prompt injection + trust model

`server/src/modules/reviews/run-executor.ts` → `buildSkillBlocks(agentId)`:
1. `agents.linkedSkills(agentId)` (ordered),
2. keep only `enabled`,
3. map each → `skillPromptBlock(skill)`,
4. feed the engine's `skills` slot (`reviewer-core`); if empty, the field is
   omitted and the prompt shape is unchanged. A load error is logged and returns
   `[]` (the review does not fail).

**Trust model** (`skills/helpers.ts`):
- `manual`, `extracted` → **trusted**: body passes through as-is (the user
  authored it).
- `community`, `imported_url` → **untrusted**: wrapped via `wrapUntrusted(...)`
  from `reviewer-core` so the model treats the text as **data, not
  instructions** — defense against prompt injection via a third-party skill.

## 6. UI

- **Page** `/skills` and `/skills/:id` — one shared master-detail (`SkillsView`).
  Left: search + "Add Skill" (blank / from file / community) + the list.
  Right: `SkillEditor` or a select prompt. Tab state lives in `?tab=`.
- **`SkillEditor`** — two tabs: **Config** (name/description/type/body +
  `enabled` toggle, Save) and **Preview** (the body rendered exactly as the
  agent receives it). Untrusted sources show a vetting notice.
- **`AddSkillDrawer`** — two import paths: from file (`.md`, body = file
  contents, name derived from H1 when blank) and from community (search →
  preview card → one-click import).
- **Skills tab in the agent editor** (`SkillsTab`) — lists every workspace skill
  with toggles; linked skills sort first in their link order (order = prompt
  order); changes persist via `POST /agents/:id/skills`.
- **Navigation**: a "Skills" item in WORKSPACE, the `g s` shortcut, routes in
  `routes.skills()` / `routes.skill(id, tab)`. Copy lives in
  `messages/en/skills.json`.

## 7. Contracts

Shared Zod contracts (vendored shared — edit at the source): `SkillType`,
`SkillSource`, `Skill`, `CommunitySkill`, `AgentSkillLink`. DTO mapping is
`toSkillDto` (DB row → public `Skill`).

## 8. Testing

- `server/test/skills-helpers.test.ts` — unit (7): `skillPromptBlock`
  (trusted/untrusted), `deriveSkillName`, `toSkillDto`.
- `server/test/skills.it.test.ts` — integration (7, testcontainers Postgres):
  CRUD, versioning on body change, import from catalog/markdown, workspace
  scoping.
- Checks: `pnpm typecheck` (server + client), `pnpm lint:arch`.

## 9. Known trade-offs (from self-review)

- Skill insert and version snapshot are two separate `await`s, not in a
  transaction; a failure between them leaves a skill without its v1 snapshot.
  Candidate for `db.transaction`.
- `run-executor` imports `skills/helpers` directly (cross-module) — `depcruise`
  emits a warning (consistent with the existing `repos → repo-intel` precedent).
