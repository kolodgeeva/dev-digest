import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { ToolDeps, RunOutcome, OutcomeFinding } from '../../deps.js';

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

/** A ToolDeps with benign defaults; override per test. */
export function makeDeps(over: Partial<ToolDeps> = {}): ToolDeps {
  return {
    listAgents: async () => [],
    runAgentOnPr: async () => ({ kind: 'outcome', outcome: outcome() }),
    getOutcome: async () => undefined,
    getConventions: async () => [],
    ...over,
  };
}
