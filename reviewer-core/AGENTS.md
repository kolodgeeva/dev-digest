# reviewer-core — @devdigest/reviewer-core

Pure review engine: **diff → prompt → LLM → grounded findings**. No DB, GitHub, or
filesystem; the only side effect is an LLM call via an **injected** `LLMProvider`
(that's what makes it mock-testable). Consumed by `server/` through a tsconfig path
alias as TypeScript source — the package never emits JS.

## Commands
`pnpm test` (vitest, hermetic, stubbed LLM) · `pnpm typecheck` · `pnpm build` (type-check only)

## Where things live
- `src/prompt.ts` — `assemblePrompt` / `wrapUntrusted` · `src/grounding.ts` — citation gate
- `src/llm/` — `LLMProvider` + structured output · `src/review/` — `run` orchestrator
- `src/index.ts` — public API · contracts come from `@devdigest/shared`

## Conventions
- Tests are hermetic with a stubbed `LLMProvider` — no keys, no network.
- The grounding step is mandatory: a finding that doesn't cite a real diff line is
  dropped; the score is recomputed from surviving findings, never trusted from the model.

## Do-not-touch
- `src/vendor/shared/**` (if present) — vendored contracts; edit at the source.

## Read when
- **Read `reviewer-core/README.md`** for the full pipeline diagram and public API.
- **Read `reviewer-core/INSIGHTS.md`** before working here; append learnings via
  `/engineering-insights`, append-only.
