import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff classification patterns + thresholds — the SINGLE source of truth.
 * Kept here (domain constants, no Fastify/Drizzle) so the rules are tunable in
 * one place rather than inlined in the classifier (acceptance criterion).
 *
 * Classification is first-match-wins, evaluated boilerplate → wiring → core,
 * so a path matching neither boilerplate nor wiring falls through to `core`.
 */

/** Generated / mechanical files — skim only. Lock-files ALWAYS land here. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/,
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /\.map$/,
];

/** Config / barrels / infra glue — hooks the core into the app. */
export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.(ts|tsx|js|jsx)$/, // barrel files
  /\.config\.(ts|js|cjs|mjs|json)$/,
  /(^|\/)(tsconfig.*\.json|package\.json)$/,
  /(^|\/)(\.env.*|Dockerfile|docker-compose\.ya?ml)$/,
  /\.ya?ml$/,
  /(^|\/)(server|app|main|config|wiring|routes?)\.(ts|tsx|js)$/,
];

/** Render order of the groups, top → bottom. */
export const GROUP_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/** Sum of core+wiring add/del lines above which a PR is flagged `too_big`. */
export const SPLIT_TOTAL_LINES_THRESHOLD = 500;

/** Need at least this many top-level-dir clusters to actually propose a split. */
export const SPLIT_MIN_GROUPS = 2;
