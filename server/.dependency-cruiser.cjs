/**
 * Onion / clean-architecture enforcement for `@devdigest/api`.
 *
 * Encodes the one rule of onion architecture — **dependencies point inward** —
 * as machine-checked import rules. See `.claude/skills/onion-architecture/`.
 *
 * Layer map (outer → inner), per module `src/modules/<name>/`:
 *   routes.ts        presentation   (Fastify plugin, Zod schemas, HTTP)
 *   service.ts       application     (use-case orchestration; no I/O details)
 *   types/constants/helpers.ts  domain (pure; no Fastify, Drizzle, adapters)
 *   repository.ts / repository/*  infrastructure (the only place Drizzle lives)
 *   ../../adapters/* + ../../platform/container.ts  ports & adapters (DI)
 *
 * Port *interfaces* (LLMProvider, GitClient, …) live in `@devdigest/shared`;
 * `adapters/*` are their implementations; `platform/container.ts` is the
 * composition root (allowed to import everything — that is its job).
 *
 * Severity tiers:
 *   error  — invariants the codebase already honours; break the build.
 *   warn   — known debt the skill documents as anti-patterns (DB-in-route in
 *            settings/workspace/polling/pulls; a cross-module constants import).
 *
 * Run: `pnpm lint:arch`.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'infra-no-import-outward',
      severity: 'error',
      comment:
        'Infrastructure (repository) must not import routes/service. Dependencies point inward — the inner layers never know about the outer ones.',
      from: { path: 'src/modules/[^/]+/repository(\\.ts|/[^/]+\\.ts)$' },
      to: { path: 'src/modules/[^/]+/(routes|service)\\.ts$' },
    },
    {
      name: 'app-no-direct-db',
      severity: 'error',
      comment:
        'Application (service.ts) must not touch Drizzle or db/* directly — go through the repository (or a port on the DI container).',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: 'node_modules/drizzle-orm|src/db/(schema|client)' },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'Domain (types/constants/helpers) must stay framework-free: no Fastify, no Drizzle, no adapters. Input → output only.',
      from: { path: 'src/modules/[^/]+/(types|constants|helpers)\\.ts$' },
      to: { path: 'node_modules/(fastify|drizzle-orm)|src/adapters/' },
    },
    {
      name: 'domain-no-db-schema',
      severity: 'warn',
      comment:
        'Domain code reaching into db/schema for a row type leaks infrastructure. Prefer a row type from db/rows or a DTO shape. Known debt: repos/helpers.ts.',
      from: { path: 'src/modules/[^/]+/(types|constants|helpers)\\.ts$' },
      to: { path: 'src/db/(schema|client)' },
    },
    {
      name: 'no-cross-module-coupling',
      severity: 'error',
      comment:
        "Do not import another module's routes/service/repository. Promote the shared piece to modules/_shared, platform, or an adapter behind a port.",
      from: { path: 'src/modules/([^/]+)/' },
      to: {
        path: 'src/modules/([^/]+)/(routes|service|repository)',
        pathNot: 'src/modules/$1/',
      },
    },
    {
      name: 'route-no-direct-db',
      severity: 'warn',
      comment:
        'DB-in-route anti-pattern: presentation (routes.ts) should call a service, not Drizzle/db directly. Known debt: settings, workspace, polling, pulls.',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'node_modules/drizzle-orm|src/db/(schema|client)' },
    },
    {
      name: 'no-cross-module-domain',
      severity: 'warn',
      comment:
        "Importing a sibling module's pure code (constants/types/helpers) couples the modules — promote it to modules/_shared instead.",
      from: { path: 'src/modules/([^/]+)/' },
      to: {
        path: 'src/modules/([^/]+)/(constants|types|helpers)',
        pathNot: 'src/modules/$1/',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
