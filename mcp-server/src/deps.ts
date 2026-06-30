import type { Agent, ConventionCandidate } from '@devdigest/shared';

/**
 * The narrow surface the tools depend on. Under R8 this is backed by an HTTP
 * client (`http-client.ts`) that talks to the running DevDigest API; unit tests
 * pass plain-object fakes. Each method maps 1:1 to one API endpoint — the tools
 * stay agnostic to the transport.
 *
 * No `@server/*` imports: the MCP process holds no DB, Container, or keys. The
 * only borrowed types are `@devdigest/shared` contracts (`Agent`,
 * `ConventionCandidate`), which are erased at runtime.
 */

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
 * Result of the synchronous `POST /reviews/run-sync`: either the finished
 * outcome, or — if the review outlived the server-side wait — a `run_id` to
 * fetch later with `get_findings`.
 */
export type RunSyncResult =
  | { kind: 'outcome'; outcome: RunOutcome }
  | { kind: 'running'; run_id: string };

export interface ToolDeps {
  /** `GET /agents` — all reviewer agents in the local workspace. */
  listAgents(): Promise<Agent[]>;

  /** `POST /reviews/run-sync` — create → wait → collect, server-side, in one call. */
  runAgentOnPr(input: { repo: string; pr: number; agent: string }): Promise<RunSyncResult>;

  /** `GET /runs/:id/outcome` — concise outcome by run id; `undefined` if unknown. */
  getOutcome(runId: string): Promise<RunOutcome | undefined>;

  /** `GET /conventions?repo=owner/name` — the repo's vetted conventions. */
  getConventions(repo: string): Promise<ConventionCandidate[]>;
}
