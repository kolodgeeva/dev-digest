import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { ToolDeps, RunOutcome, OutcomeFinding, BlastResponse } from '../../deps.js';

/** Minimal Agent for list_agents tests (only id/name/enabled/model are projected). */
export function agent(id: string): Agent {
  return {
    id,
    name: `Agent ${id}`,
    description: `desc ${id}`,
    enabled: true,
    model: 'gpt-4o',
  } as unknown as Agent;
}

/** Minimal finding in the API outcome shape (snake_case). */
export function finding(over: Partial<OutcomeFinding> = {}): OutcomeFinding {
  return {
    severity: 'CRITICAL',
    category: 'security',
    title: 'SQL injection',
    file: 'src/db.ts',
    start_line: 10,
    end_line: 12,
    suggestion: 'Parameterize the query.',
    ...over,
  };
}

export function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  return {
    run_id: 'run-1',
    status: 'done',
    error: null,
    verdict: 'request_changes',
    score: 60,
    summary: 'One blocker.',
    findings: [finding()],
    ...over,
  };
}

export function conventionCandidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'c1',
    rule: 'Use async/await',
    evidence_path: 'src/api.ts',
    evidence_snippet: 'await db.query()',
    confidence: 0.9,
    accepted: true,
    ...over,
  };
}

/** A blast-radius fixture with ≥2 callers and ≥1 endpoint by default. */
export function blast(over: Partial<BlastResponse> = {}): BlastResponse {
  return {
    changed_symbols: [
      { name: 'fetchUser', file: 'src/users/service.ts', kind: 'function' },
      { name: 'UserRow', file: 'src/users/types.ts', kind: 'interface' },
    ],
    downstream: [
      {
        symbol: 'fetchUser',
        callers: [
          { name: 'getProfile', file: 'src/profile/handler.ts', line: 42 },
          { name: 'listUsers', file: 'src/admin/handler.ts', line: 17 },
        ],
        endpoints_affected: ['GET /profile', 'GET /admin/users'],
        crons_affected: [],
      },
    ],
    summary: '2 symbols changed · 2 downstream callers across 2 files · 2 endpoints impacted',
    degraded: false,
    reason: null,
    ...over,
  };
}

/** A ToolDeps with benign defaults; override per test. */
export function makeDeps(over: Partial<ToolDeps> = {}): ToolDeps {
  return {
    listAgents: async () => [],
    runAgentOnPr: async () => ({ kind: 'outcome', outcome: outcome() }),
    getOutcome: async () => undefined,
    getConventions: async () => [],
    getBlastRadius: async () => blast(),
    ...over,
  };
}
