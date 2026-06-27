import type { CommunitySkill, SkillType } from '@devdigest/shared';

/** Constants for the skills module. */

/** Initial config version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill description when none is supplied. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/**
 * A community-catalog entry: the public `CommunitySkill` card shown in the
 * browser, plus the data needed to materialize a real skill on import (`id` is
 * the import key; `type`/`body` seed the created row). The catalog is read-only
 * reference data bundled with the app — NOT a DB table and not workspace-scoped.
 * Imported entries land as `source: 'community'` and are delimiter-wrapped as
 * untrusted when injected into a review prompt.
 */
export interface CatalogEntry {
  /** Stable import key (POST /skills/import { catalog_id }). */
  id: string;
  type: SkillType;
  card: CommunitySkill;
  body: string;
}

export const COMMUNITY_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'secret-leakage-gate',
    type: 'security',
    card: {
      name: 'secret-leakage-gate',
      repo: 'devdigest/community-skills',
      stars: 1240,
      lang: 'any',
      desc: 'Detects sk_live, service_role, and NEXT_PUBLIC secrets leaking in the diff.',
    },
    body: [
      '# Secret Leakage Gate',
      '',
      'Flag any credential, token, or key that appears in the diff. Treat these as',
      'CRITICAL when they look real (not obviously a placeholder):',
      '',
      '- Stripe live keys (`sk_live_…`), test keys only if committed to prod config.',
      '- Supabase/Postgres `service_role` keys or connection strings with passwords.',
      "- `NEXT_PUBLIC_*` values that embed a secret (these ship to the browser).",
      '- Generic high-entropy strings assigned to `*_KEY`, `*_TOKEN`, `*_SECRET`.',
      '',
      'For each, cite the exact added line and recommend rotating the credential and',
      'moving it to a secret manager / untracked env file.',
    ].join('\n'),
  },
  {
    id: 'lethal-trifecta',
    type: 'security',
    card: {
      name: 'lethal-trifecta',
      repo: 'devdigest/community-skills',
      stars: 980,
      lang: 'any',
      desc: 'Flags PRs combining private data access, untrusted input, and external egress.',
    },
    body: [
      '# Lethal Trifecta',
      '',
      'Raise a finding when a single change path combines all three:',
      '',
      '1. **Private data access** — reads secrets, user PII, or internal records.',
      '2. **Untrusted input** — request bodies, webhook payloads, LLM/tool output.',
      '3. **External egress** — outbound `fetch`, email, webhook, or logging to a',
      '   third party.',
      '',
      'Together these enable exfiltration. Explain the path explicitly (source →',
      'sink) and propose breaking one leg (validate input, scope data, or remove the',
      'egress).',
    ].join('\n'),
  },
  {
    id: 'pr-quality-rubric',
    type: 'rubric',
    card: {
      name: 'pr-quality-rubric',
      repo: 'devdigest/community-skills',
      stars: 2310,
      lang: 'any',
      desc: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    },
    body: [
      '# PR Quality Rubric',
      '',
      "Evaluate the pull request against the following dimensions. For each, return a",
      "finding only when the issue is **worth the author's time** — aim for 5",
      'high-signal findings, not 50.',
      '',
      '## Correctness',
      '- Does the change do what the PR description claims?',
      '- Are edge cases (empty input, nulls, concurrency) handled?',
      '',
      '## Security',
      '- Any secrets, tokens, or credentials in the diff?',
      '- Untrusted input reaching a sink (SQL, shell, fetch)?',
      '',
      '## Tests',
      '- New branches covered by assertions?',
      '- Are tests meaningful (not just snapshot churn)?',
      '',
      '## Scope',
      '- Does the diff stay within the stated intent?',
      '- Flag out-of-scope changes separately rather than blocking.',
    ].join('\n'),
  },
  {
    id: 'phantom-api-gate',
    type: 'security',
    card: {
      name: 'phantom-api-gate',
      repo: 'devdigest/community-skills',
      stars: 640,
      lang: 'typescript',
      desc: 'Detects imports of functions/modules that do not exist in the codebase.',
    },
    body: [
      '# Phantom API Gate',
      '',
      'Flag calls to functions, methods, or modules that the diff introduces but',
      'never defines or imports from a real source — a common hallucination pattern.',
      '',
      '- Imported symbol with no matching export anywhere in the changed files or',
      '  repo map.',
      '- Method called on an object whose type has no such member.',
      '- Package imported that is not in the dependency manifest.',
      '',
      'Cite the offending line and ask the author to confirm the symbol exists.',
    ].join('\n'),
  },
];
