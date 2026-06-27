# onion-architecture

> **Version:** 1.0.0 · **Last updated:** 2026-06-21 · **Scope:** Backend (DevDigest `server/`)

Human-facing companion to the skill. The agent reads [SKILL.md](./SKILL.md) (rules) and
[structure.md](./structure.md) (annotated layer map). This file records **what the skill is,
what it covers, when it triggers, how it relates to other skills, and every source** behind it.

## Focus

**Architecture, layering, and code placement only** — *where* backend code lives and *which
direction* dependencies flow in `server/src/`. It answers: routes vs service vs repository,
where business logic / DB access / external calls belong, how ports & adapters and the DI
container fit, and where module boundaries are.

It deliberately does **not** cover Fastify route mechanics, Drizzle query authoring, or Zod
contract design — those are delegated (see [Related skills](#related-skills)) to avoid duplication.

## What it covers

- **The dependency rule**: coupling points inward; inner layers never import outer ones.
- **Layer map** of a module: `routes (presentation) → service (application) → domain → repository (infrastructure)`.
- **Ports & adapters**: interfaces in `@devdigest/shared`, implementations in `adapters/*`, wiring in `platform/container.ts` (composition root).
- **Where each kind of code goes**: endpoints, validation, use cases, business rules, DB access, external calls, types, constants.
- **service vs repository vs adapter** naming discipline.
- **Module boundaries**: no cross-module imports; promote shared code to `_shared`/`platform`.
- **Automated enforcement** via `dependency-cruiser` (`pnpm lint:arch`), with error/warn tiers.

## When it triggers (use cases)

- Adding a new backend module/endpoint and deciding where each file goes.
- "Where should this go — service or repository? Should the route hit the DB?"
- Introducing a new external integration (LLM/GitHub/git) and wiring it behind a port.
- Refactoring a fat orchestrator or a DB-in-route module toward clean layers.
- Reviewing a PR for layering and dependency direction.

## Related skills

| Skill | Owns (so this skill doesn't) |
|-------|------------------------------|
| `fastify-best-practices` | Route mechanics, plugins, hooks, schema providers, error handling |
| `drizzle-orm-patterns` | Query/relation/transaction authoring inside the repository layer |
| `zod` | Contract/schema design (contracts vendored in `vendor/shared`) |
| `typescript-expert` | Type-level design, generics, type performance |

This skill cross-links to them rather than repeating their content.

## Methodology anchor

Pragmatic **onion / clean architecture** (Palermo 2008; Martin's Dependency Rule 2012) realised
as the repo's existing **ports & adapters** layout (Cockburn): a per-module
`routes → service → repository` onion, port interfaces in `@devdigest/shared`, adapters behind
them, and `platform/container.ts` as the composition root. The single invariant — **dependencies
point inward** — is machine-enforced with `dependency-cruiser`. We formalize the existing
3-layer pattern rather than introducing a separate domain-entities layer.

---

## Sources (research behind this skill)

### A. Primary sources (canon)
- Jeffrey Palermo — The Onion Architecture, part 1 (2008): https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- Original Onion example (fork of the bitbucket repo): https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture
- Alistair Cockburn — Hexagonal Architecture (Ports & Adapters): https://alistair.cockburn.us/hexagonal-architecture
- Hexagonal Architecture — Wikipedia: https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)
- hexagonalarchitecture.org: https://www.hexagonalarchitecture.org/
- Robert C. Martin — The Clean Architecture (Clean Coder Blog, 2012): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html

### B. The Dependency Rule / dependency direction
- Clean Architecture: the essence of the dependency rule (N. Ocket): https://medium.com/@aboutcoding/clean-architecture-the-essence-of-the-dependency-rule-969f1e8417f6
- Clean Architecture: Uncle Bob's Dependency Rule (Chanh Le): https://chanhle.dev/en/blog/clean-architecture-guide
- Building Software with a Clean Architecture (softengbook): https://softengbook.org/articles/clean-architecture
- What is a Hexagonal Architecture? (softengbook): https://softengbook.org/articles/hexagonal-architecture

### C. Onion — explanation & practice
- Onion Architecture (Allegro Tech blog): https://blog.allegro.tech/2023/02/onion-architecture.html
- Onion Architecture (H. Graça, Software Architecture Chronicles): https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- Oliver Drotbohm — Sliced Onion Architecture: http://odrotbohm.github.io/2023/07/sliced-onion-architecture/

### D. Node.js / TypeScript — Clean Architecture (practical guides)
- Khalil Stemmler — Clean Node.js Architecture: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- Khalil Stemmler — Application Layer Use Cases: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/
- A definitive guide to Clean Architecture in Node.js + TS (V. Zdanovskyi): https://vitalii-zdanovskyi.medium.com/a-definitive-guide-to-building-a-nodejs-app-using-clean-architecture-and-typescript-41d01c6badfa
- Clean Architecture in Node.js with TS + DI (E. Gunawan): https://dev.to/evangunawan/clean-architecture-in-nodejs-an-approach-with-typescript-and-dependency-injection-16o
- typescript-clean-architecture (example repo): https://github.com/AzouKr/typescript-clean-architecture

### E. Hexagonal / Ports & Adapters — Node.js / TS
- Domain-Driven Hexagon (DDD + Hexagonal, TS/NestJS best practices): https://dev.to/sairyss/domain-driven-hexagon-18g5
- Ports & Adapters explained with two real codebases (S. Hasan): https://saadh393.github.io/blog/adapter-port-architecture-two-cases
- Ports and Adapters with TypeScript (C. Cunha): https://betterprogramming.pub/how-to-ports-and-adapter-with-typescript-32a50a0fc9eb
- node-typescript-architecture (functional ports-and-adapters): https://github.com/jbreckmckye/node-typescript-architecture
- hexagonal_example_nodejs: https://github.com/fraybabak/hexagonal_example_nodejs

### F. Repository / Domain layering (where data access lives)
- Khalil Stemmler — Repository, DTO & Mapper pattern (DDD w/ TS): https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/
- Khalil Stemmler — Understanding Domain Entities: https://khalilstemmler.com/articles/typescript-domain-driven-design/entities/
- Khalil Stemmler — Intro to Domain-Driven Design: https://khalilstemmler.com/articles/domain-driven-design-intro/

### G. Tooling (forcing the architecture)
- dependency-cruiser (validate & visualize dependencies): https://github.com/sverweij/dependency-cruiser
- dependency-cruiser — rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md

### H. Skill-authoring best practices (how this skill itself was built)
- Anthropic — Equipping agents for the real world with Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Anthropic — Skill authoring best practices: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Anthropic — skills repo (skill-creator): https://github.com/anthropics/skills

## Changelog

- **1.0.0** (2026-06-21) — Initial skill: SKILL.md (rules), structure.md (annotated layer map),
  README.md (overview + sources), plus `server/.dependency-cruiser.cjs` enforcement and the
  `pnpm lint:arch` script. Anchored to `server/src/` conventions.
