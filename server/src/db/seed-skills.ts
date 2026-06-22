import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Demo skills for the seeded workspace (lesson A1 — Skills).
 *
 * Bodies live here (mirroring `seed-prompts.ts`) to keep `seed.ts` readable.
 * The set covers every `source` so the Skills page shows the full trust story:
 *   - manual / extracted  → trusted, injected verbatim
 *   - community / imported_url → untrusted, delimiter-wrapped on injection
 *
 * `linkTo` names the built-in agents this skill is attached to; the per-agent
 * link order follows this array's order (it's the order in the review prompt).
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  /** For `extracted` skills: the diffs the rule was distilled from. */
  evidenceFiles?: string[];
  /** Built-in agent names to link this skill to. */
  linkTo?: string[];
}

const PR_QUALITY_RUBRIC = [
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
].join('\n');

const NO_THEN_CHAINS = [
  '# No `.then()` chains',
  '',
  'House rule: always use `async`/`await` instead of `.then()`/`.catch()`',
  'promise chains. Awaiting reads top-to-bottom, keeps stack traces intact, and',
  'avoids the nested-callback drift this codebase has been bitten by.',
  '',
  'Flag as a WARNING when a diff adds:',
  '- `.then(` / `.catch(` / `.finally(` on a promise that could be awaited.',
  '- A function returning a chain where an `async` function would read cleaner.',
  '',
  'Do not flag: `Promise.all([...])`, `.then` on a thenable that is not a real',
  'promise, or chains in third-party type stubs.',
].join('\n');

const SECRET_LEAKAGE_GATE = [
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
].join('\n');

const LETHAL_TRIFECTA = [
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
].join('\n');

const PHANTOM_API_GATE = [
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
].join('\n');

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    body: PR_QUALITY_RUBRIC,
    enabled: true,
    linkTo: ['General Reviewer', 'Security Reviewer', 'Performance Reviewer'],
  },
  {
    name: 'no-then-chains',
    description: 'House rule: always use async/await instead of .then() promise chains.',
    type: 'convention',
    source: 'extracted',
    body: NO_THEN_CHAINS,
    enabled: true,
    evidenceFiles: ['src/api/public/webhooks.ts', 'src/middleware/ratelimit.ts'],
    linkTo: ['General Reviewer'],
  },
  {
    name: 'secret-leakage-gate',
    description: 'Detects sk_live, service_role, and NEXT_PUBLIC secrets leaking in the diff.',
    type: 'security',
    source: 'community',
    body: SECRET_LEAKAGE_GATE,
    enabled: true,
    linkTo: ['Security Reviewer'],
  },
  {
    name: 'lethal-trifecta',
    description: 'Flags PRs combining private data access, untrusted input, and external egress.',
    type: 'security',
    source: 'community',
    body: LETHAL_TRIFECTA,
    enabled: true,
    linkTo: ['Security Reviewer'],
  },
  {
    name: 'phantom-api-gate',
    description: 'Detects imports of functions/modules that do not exist in the codebase.',
    type: 'security',
    source: 'imported_url',
    body: PHANTOM_API_GATE,
    enabled: false,
  },
];
