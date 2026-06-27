# Feature spec: Conventions (repo house-rules → vetted Skill)

> Status: **implemented** (branch `L02`). Sibling to `docs/specs/skills.md`: this feature
> populates the `extracted` skill source that skills.md reserves but leaves unbuilt
> ("auto-extraction of skills … has no UI/pipeline yet"). Source of truth once built:
> `server/src/modules/conventions/**`, `client/src/app/conventions/**`,
> `server/src/db/schema/conventions.ts`.

## 1. Goal

Surface a repo's **house conventions** (naming, error handling, structure, access
patterns) as **candidates**, each **grounded in real file evidence**, let the user
**accept / reject / edit** them, and **merge the accepted ones into a single editable
Skill** (`type: 'convention'`, `source: 'extracted'`) that links to agents via the
existing Skills Lab mechanism.

Why: today every skill is hand-authored. A team's conventions already live implicitly in
their code — this mines them, keeps only what the user vets, and turns them into a
reusable, versioned review rule. It closes the loop skills.md left open.

## 2. Scope

1. **Sampling (code, no model)** — gather a candidate file pool from
   `repoIntel.getConventionSamples(repoId, 12)` (top-ranked source files, tests/configs
   already filtered).
2. **Two-step extraction (cheap model)** — call 1 `ConventionFileSelection` picks the
   most representative files to read in full; call 2 `ConventionExtraction` returns
   candidates `{ category, rule, evidence_path, evidence_snippet, confidence }`.
3. **Grounding gate** — a candidate survives only if its `evidence_path` is a file we
   actually read **and** its `evidence_snippet` appears in that file (whitespace-
   normalized substring). Ungrounded candidates are dropped — no hallucinated evidence.
   Mirrors the `reviewer-core/src/grounding.ts` "cite real code or be dropped" rule.
4. **Triage** — persisted candidates can be accepted, rejected, or inline-edited
   (rule text / snippet).
5. **Skill assembly** — accepted candidates merge into one markdown skill body (editable
   in a modal with name/description/type/enabled), saved as `source: 'extracted'` with
   `evidence_files` = the cited paths; optionally linked to an agent on save.
6. **UI** — a Conventions page under Skills Lab: scan button, candidate cards with a
   confidence bar + evidence, accept/reject/edit, and the "Create skill from conventions"
   modal.

**Out of scope for this stage:** improving finding quality/quantity (feeding
eslint/tsconfig/prettier into the sample, dedupe/clustering, confidence calibration,
emitting multiple skills) — reserved for a follow-up. Async/job-based extraction
(extraction is synchronous: one request → candidates).

## 3. Data model

The `conventions` table **already exists** in `server/src/db/schema/knowledge.ts` and is
reused as-is — no migration. A pending candidate is `accepted: false`; accepting flips the
flag, rejecting deletes the row.

### `conventions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `workspace_id` | uuid FK → `workspaces` | `onDelete: cascade`; workspace-scoped |
| `repo_id` | uuid FK → `repos` | `onDelete: cascade` |
| `rule` | text NOT NULL | the convention statement |
| `evidence_path` | text | cited file (repo-relative) |
| `evidence_snippet` | text | cited code; verified against the file |
| `confidence` | double precision | model confidence `0..1` |
| `accepted` | boolean NOT NULL | default `false` (pending → accepted) |

- An `extract` run **replaces** the repo's prior pending rows (`accepted = false`),
  keeping already-accepted rows as history. `ConventionRow` added to
  `server/src/db/rows.ts`; the LLM returns a `category` per candidate but it is used only
  to title skill sections, not persisted.
- The produced skill reuses the **existing** `skills` table (`source: 'extracted'`,
  `evidence_files` jsonb) — no new skill storage; see skills.md §3.

## 4. API

Module `server/src/modules/conventions/` (routes → service → repository); workspace via
`getContext`; Zod validation. Registered in `server/src/modules/index.ts`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/repos/:id/conventions/extract` | run the pipeline; persist + return `ConventionCandidate[]` |
| `GET` | `/repos/:id/conventions` | list persisted candidates for the repo |
| `PATCH` | `/conventions/:id` | `{ accepted?, rule?, evidence_snippet? }` — accept / inline-edit |
| `DELETE` | `/conventions/:id` | reject (remove) a candidate |
| `POST` | `/repos/:id/conventions/skill/draft` | assemble default `{ name, description, body }` from **accepted** candidates (editable before save) |
| `POST` | `/repos/:id/conventions/skill` | create skill from final `{ name, description, type, body, enabled, agent_id? }` |

- `createSkill` inserts via the composition-root **`container.skillsRepo.insert`** (the
  public `SkillsService.create` hardcodes `source: 'manual'`) with `source: 'extracted'`,
  `type: 'convention'`, `evidence_files` = distinct accepted `evidence_path`s; when
  `agent_id` is present, links via **`container.agentsRepo.linkSkill(agentId, skillId, order)`**.
- Clone reads use a new public `RepoIntelService.readSampleFiles(repoId, paths)` reusing
  the existing private `readClone(repo.clonePath, file)` (`repo-intel/service.ts`).

## 5. Extraction pipeline + trust model

`server/src/modules/conventions/service.ts` → `extract(workspaceId, repoId)`:
1. `paths = repoIntel.getConventionSamples(repoId, 12)`.
2. LLM `completeStructured({ schemaName: 'ConventionFileSelection', schema, messages })`
   → chosen subset (≤6).
3. `files = repoIntel.readSampleFiles(repoId, chosen)`.
4. LLM `completeStructured({ schemaName: 'ConventionExtraction', ... })` → candidates.
5. `groundCandidates(candidates, files)` (`helpers.ts`) — drop ungrounded.
6. `repo.replacePending(repoId, grounded)`; return DTOs.

- **Model**: resolved via `resolveAvailableLlm(container, workspaceId, 'conventions')`
  (`modules/settings/feature-models.ts`) — it takes the `conventions` feature-model
  (workspace override else registry default) but, crucially, **falls back to any other
  provider whose API key is configured** if the resolved provider's key is missing, so
  extraction runs on whatever key the user has rather than hard-failing on the default
  provider. Errors with a clear "add a key in Settings → API Keys" only when no LLM key
  exists at all.
- **Trust**: file contents fed to the model are **untrusted** repo code → wrapped via
  `wrapUntrusted(...)` from `reviewer-core` (same defense skills.md §5 uses). The two
  LLM Zod schemas (`ConventionFileSelection`, `ConventionExtraction`) live in-module
  (`schemas.ts`); their `schemaName` strings **must** match the `MockLLMProvider`
  `structuredBySchema` fixtures (`server/src/adapters/mocks.ts`).

## 6. UI

- **Page** `/conventions` (`client/src/app/conventions/`) — thin `page.tsx` →
  `ConventionsView`; the active repo comes from `useActiveRepo()`
  (`client/src/lib/repo-context`). Heading "Conventions in {repo}".
- **`ConventionsView`** — Run extraction / Re-scan button, Accept all / Reject all, the
  candidate list, and a "Create skill" action opening the modal.
- **`ConventionCard`** — rule title, evidence `path` + snippet code block, `ProgressBar`
  confidence, Accept / Reject / Edit; Edit switches to inline `TextInput`/`Textarea` →
  `PATCH`.
- **`CreateSkillFromConventionsModal`** — `Modal` + `FormField`/`TextInput`/`SelectInput`
  (type) / `Toggle` (enabled) / `Textarea` (body prefilled from `/skill/draft`),
  Cancel / Create.
- **Hooks** `client/src/lib/hooks/conventions.ts`: `useConventions`,
  `useExtractConventions`, `useUpdateConvention`, `useRejectConvention`,
  `useDraftConventionSkill`, `useCreateConventionSkill` (TanStack Query + `api`,
  mirroring `hooks/skills.ts`).
- **Navigation**: a Conventions item in the Skills Lab group of
  `client/src/vendor/ui/nav.ts` (`g c`); `activeKeyFor()` already routes `/conventions`.
  Copy in `messages/en/conventions.json` (extended with card-edit/reject/accept-all/
  modal strings — no hardcoded JSX).

## 7. Contracts

No shared-contract changes were needed: the existing `ConventionCandidate`
(`{ id, rule, evidence_path, evidence_snippet, confidence, accepted }`, already mirrored in
both vendored `shared` copies) is the list/extract DTO. Request bodies (`PATCH` patch,
create-skill input) are route-local Zod in `conventions/routes.ts`; the two LLM response
schemas (`ConventionFileSelection`, `ConventionExtraction`) are in-module
(`conventions/schemas.ts`). DTO mapping is `toConventionDto` (row → `ConventionCandidate`).

## 8. Testing

- `server/test/conventions-helpers.test.ts` — unit: `groundCandidates` (keeps grounded,
  **drops** a candidate whose snippet isn't in the read files), `assembleSkillBody`,
  `toConventionDto`.
- `server/test/conventions.it.test.ts` — integration (testcontainers Postgres): drive
  `extract` with `MockLLMProvider({ structuredBySchema: { ConventionFileSelection,
  ConventionExtraction } })`; assert grounding drops the hallucinated candidate,
  `PATCH` accept/edit + `DELETE` reject, `replacePending` keeps accepted rows on
  re-extract, and `createSkill` writing `source:'extracted'` + `evidence_files` and
  linking to an agent when `agent_id` is passed.
- Checks: `pnpm typecheck` (server + client), `pnpm lint:arch`.

## 9. Known trade-offs

- Extraction makes two model calls per scan; cost is bounded by the cheap feature-model
  and the ≤6-file cap. No caching of scans beyond the persisted `pending` rows.
- Grounding is a normalized **substring** match on the snippet (not line-range like the
  diff grounder), since candidates cite a snippet rather than diff lines — tolerant of
  reformatting but won't catch a snippet the model lightly paraphrases.
- `createSkill` uses the composition-root `container.skillsRepo`/`container.agentsRepo`
  (no direct cross-module repository import). It still maps the inserted row via
  `skills/helpers.toSkillDto`, which `depcruise` flags as a `no-cross-module-domain`
  **warning** — the same accepted precedent as `run-executor → skills/helpers` (skills.md §9).
