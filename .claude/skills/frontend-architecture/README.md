# frontend-architecture

> **Version:** 1.0.0 · **Last updated:** 2026-06-21 · **Scope:** Frontend (DevDigest `client/`)

Human-facing companion to the skill. The agent reads [SKILL.md](./SKILL.md) (rules) and
[structure.md](./structure.md) (annotated folder map). This file records **what the skill is,
what it covers, when it triggers, how it relates to other skills, and every source** behind it.

## Focus

**Architecture and code placement only** — *where* frontend code lives and *which direction*
dependencies flow. It answers: where do components go, how to split them, where constants /
utils / helpers / business logic belong, and how to lay out folders for React + Next.js App Router.

It deliberately does **not** cover React runtime patterns or Next.js data-fetching mechanics —
those are delegated (see [Related skills](#related-skills)) to avoid duplication.

## What it covers

- **Folder structure** of `client/src/` (App Router routing + feature colocation).
- **Colocate-first / promote-on-reuse** decision rule (when to move code to `shared`).
- **Dependency direction**: `lib → components → app`, no cross-route imports.
- **Component splitting**: one-per-file, size/props limits, container vs presentational.
- **Constants** placement (colocated vs app-wide).
- **utils vs helpers vs services**: pure functions vs feature glue vs I/O.
- **Business-logic location**: custom hooks / services / Server Actions, never component bodies.
- **Next.js App Router specifics**: `_private` folders, `(route groups)`, thin `page`/`layout`,
  visible client/server boundary.

## When it triggers (use cases)

- Adding a new feature/route and deciding where each file goes.
- "Where should this component / constant / hook / util live?"
- Refactoring or flattening a messy folder structure.
- Splitting an oversized component or extracting logic out of a component body.
- Reviewing a PR for architectural placement and dependency direction.

## Related skills

| Skill | Owns (so this skill doesn't) |
|-------|------------------------------|
| `react-best-practices` | Hooks rules, derived state, memoization, keys, a11y, conditional rendering |
| `next-best-practices` | RSC boundaries, data fetching, metadata, route handlers, optimization |
| `typescript-expert` | Type-level design, generics, type performance |
| `zod` | Contract/schema design (contracts are vendored in `vendor/shared`) |

This skill cross-links to them rather than repeating their content.

## Methodology anchor

Pragmatic **feature-based** structure in the spirit of *bulletproof-react* (colocation + a `shared`
layer + a one-way dependency rule), adapted to Next.js App Router colocation as documented by
Next.js. Feature-Sliced Design is referenced as supporting theory, not adopted wholesale.

---

## Sources (research behind this skill)

### A. Folder structure / project architecture (where components live)
- Bulletproof React — project structure: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- Bulletproof React — repo (full methodology): https://github.com/alan2207/bulletproof-react
- Robin Wieruch — React Folder Structure Best Practices [2026]: https://www.robinwieruch.de/react-folder-structure/
- Josh W. Comeau — Delightful React File/Directory Structure: https://www.joshwcomeau.com/react/file-structure/
- Profy.dev — Popular React Folder Structures & Screaming Architecture: https://profy.dev/article/react-folder-structure
- React Handbook — Project Standards: https://reacthandbook.dev/project-standards
- Web Dev Simplified — How To Structure React Projects: https://blog.webdevsimplified.com/2022-07/react-folder-structure/
- React (legacy docs) — File Structure FAQ ("structure is not critical"): https://legacy.reactjs.org/docs/faq-structure.html
- DEV — Recommended Folder Structure for React 2025: https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc

### B. Feature-Sliced Design (formal layers/slices/segments methodology)
- FSD — home: https://feature-sliced.design/
- FSD — Overview (layers, slices, segments, import rules): https://feature-sliced.design/docs/get-started/overview
- FSD — The 5 Frontend Architectures You Must Know in 2025: https://feature-sliced.design/blog/frontend-architecture-guide
- FSD — documentation (GitHub): https://github.com/feature-sliced/documentation

### C. Canonical component-design guides
- Tao of React (Alex Kondov) — full essay: https://alexkondov.com/tao-of-react/
- Tao of React — book site: https://www.taoofreact.com/
- Clean Architecture in React (Alex Kondov): https://alexkondov.com/full-stack-tao-clean-architecture-react/
- Patterns.dev (Lydia Hallie & Addy Osmani): https://www.patterns.dev/

### D. Business logic vs UI (where logic lives)
- Patterns.dev — Container/Presentational Pattern: https://www.patterns.dev/react/presentational-container-pattern/
- Felix Gerschau — Separation of concerns with React hooks: https://felixgerschau.com/react-hooks-separation-of-concerns/
- TSH — Container-presentational pattern in React: https://tsh.io/blog/container-presentational-pattern-react
- DhiWise — Keeping React UI and Logic Separate: https://www.dhiwise.com/post/mastering-the-art-of-separating-ui-and-logic-in-react
- Refine — React Design Patterns: https://refine.dev/blog/react-design-patterns/

### E. Abstractions, colocation, when to extract (constants/utils/helpers)
- Kent C. Dodds — AHA Programming (Avoid Hasty Abstractions): https://kentcdodds.com/blog/aha-programming
- Kent C. Dodds — Colocation: https://kentcdodds.com/blog/colocation
- Kent C. Dodds — State Colocation will make your React app faster: https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
- Medium (Ali Bey) — Libs vs Utils vs Services Folders: https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f
- vhoyer's blog — Difference between `services` and `utils`: https://blog.vhoyer.dev/posts/difference-between-services-and-utils/
- DEV (victor1890) — Helpers and Utils Demystified: https://dev.to/victor1890/exploring-the-contrast-helpers-and-utils-demystified-47bo

### F. Official React primary sources (react.dev)
- Thinking in React (breaking UI into components): https://react.dev/learn/thinking-in-react
- Choosing the State Structure: https://react.dev/learn/choosing-the-state-structure
- You Might Not Need an Effect: https://react.dev/learn/you-might-not-need-an-effect
- Reusing Logic with Custom Hooks: https://react.dev/learn/reusing-logic-with-custom-hooks
- Sharing State Between Components (lifting state): https://react.dev/learn/sharing-state-between-components
- Passing Data Deeply with Context: https://react.dev/learn/passing-data-deeply-with-context

### G. Next.js App Router — architecture & folder structure
- **Official docs** — Project Structure (top-level folders, file conventions): https://nextjs.org/docs/app/getting-started/project-structure
- **Official docs** — Project Organization & File Colocation (safe colocation, `_private`, route groups): https://nextjs.org/docs/app/building-your-application/routing/colocation
- FSD for Next.js — The Ultimate Next.js App Router Architecture: https://feature-sliced.design/blog/nextjs-app-router-guide
- FreeCodeCamp — Reusable Architecture for Large Next.js Applications: https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/
- Makerkit — Next.js App Router Project Structure (Definitive Guide): https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
- DEV (pipipi-dev) — App Router Directory Design / Project Structure Patterns: https://dev.to/pipipi-dev/app-router-directory-design-nextjs-project-structure-patterns-31eo
- DEV (bajrayejoon) — Organizing Your Next.js 15 (2025): https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji
- next-colocation-template (colocation-first example repo): https://github.com/arhamkhnz/next-colocation-template
- Shahin Siami — Project Structure, Routing, Layouts, File Conventions: https://shahin.page/article/nextjs-project-structure-routing-layouts-file-conventions

### H. Skill-authoring best practices (how this skill itself was built)
- Anthropic — Equipping agents for the real world with Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Anthropic — Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Anthropic — skills repo (skill-creator): https://github.com/anthropics/skills

## Changelog

- **1.0.0** (2026-06-21) — Initial skill: SKILL.md (rules), structure.md (annotated map),
  README.md (overview + sources). Anchored to `client/src/` conventions.
