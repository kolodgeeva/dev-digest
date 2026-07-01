import type { Agent, ConventionCandidate } from '@devdigest/shared';

/**
 * The narrow surface the tools depend on. Backed by an HTTP client
 * (`http-client.ts`) that talks to the running DevDigest API; unit tests pass
 * plain-object fakes. The tools stay agnostic to the transport — the client's
 * implementation does any multi-step orchestration over the API's
 * general-purpose, id-keyed endpoints (there is no MCP-specific aggregate).
 *
 * No `@server/*` imports: the MCP process holds no DB, Container, or keys. The
 * only borrowed types are `@devdigest/shared` contracts (`Agent`,
 * `ConventionCandidate`), which are erased at runtime.
 */

/**
 * A PR's blast radius built from the repo-intel index (no LLM) — the shape the
 * client reads from `GET /pulls/:id/blast`.
 */
export interface BlastResponse {
  changed_symbols: { name: string; file: string; kind: string }[];
  downstream: {
    symbol: string;
    callers: { name: string; file: string; line: number }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  summary: string;
  degraded: boolean;
  reason: string | null;
}

/** A review finding as the API serialises it (snake_case); fed to `toMcpFinding`. */
export interface OutcomeFinding {
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  suggestion?: string | null;
}

/** The concise outcome of one run, as returned by `/runs/:id/outcome`. */
export interface RunOutcome {
  run_id: string;
  status: string | null;
  error: string | null;
  verdict: string | null;
  score: number | null;
  summary: string | null;
  findings: OutcomeFinding[];
}

/**
 * Result of `runAgentOnPr`: either the finished outcome, or — if the review
 * outlived the client's poll deadline — a `run_id` to fetch later with
 * `get_findings`.
 */
export type RunSyncResult =
  | { kind: 'outcome'; outcome: RunOutcome }
  | { kind: 'running'; run_id: string };

export interface ToolDeps {
  /** All reviewer agents in the local workspace (`GET /agents`). */
  listAgents(): Promise<Agent[]>;

  /**
   * Run one agent on a PR and wait for the outcome. The client orchestrates it:
   * resolve owner/name + PR number → ids, `POST /pulls/:id/review`, then poll
   * `GET /runs/:id/outcome` until terminal (or return `{ kind: 'running' }`).
   */
  runAgentOnPr(input: { repo: string; pr: number; agent: string }): Promise<RunSyncResult>;

  /** Concise outcome by run id (`GET /runs/:id/outcome`); `undefined` if unknown. */
  getOutcome(runId: string): Promise<RunOutcome | undefined>;

  /** The repo's vetted conventions (resolve the repo id → `GET /repos/:id/conventions`). */
  getConventions(repo: string): Promise<ConventionCandidate[]>;

  /** A PR's blast radius (resolve the PR id → `GET /pulls/:id/blast`). */
  getBlastRadius(input: { repo: string; pr: number }): Promise<BlastResponse>;
}
