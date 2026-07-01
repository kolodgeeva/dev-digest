import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { ToolDeps, RunOutcome, RunSyncResult, BlastResponse } from './deps.js';
import { ApiError } from './errors.js';

/**
 * The DevDigest API HTTP client — the R8 replacement for the in-process
 * `composition.ts`. It opens no DB, builds no Container, and holds no provider
 * keys: the review runs inside the API process. The MCP process needs only a
 * base URL.
 *
 * The local API uses `LocalNoAuthProvider`, so these calls carry no auth header.
 */

export interface HttpClientConfig {
  /** API base URL, e.g. `http://localhost:3001` (no trailing slash). */
  baseUrl: string;
  /**
   * Max time `run_agent_on_pr` waits. Must exceed the server's own
   * `MCP_RUN_TIMEOUT_MS` (the route's synchronous wait) so the client doesn't
   * abort a review that the server is still finishing.
   */
  runTimeoutMs: number;
}

const DEFAULT_BASE_URL = 'http://localhost:3001';
const DEFAULT_RUN_TIMEOUT_MS = 120_000;
/** Headroom over the server wait, so the client never aborts a still-running review. */
const CLIENT_TIMEOUT_MARGIN_MS = 15_000;
/** Quick reads (agents, outcome, conventions) should fail fast if the API hangs. */
const READ_TIMEOUT_MS = 30_000;

/** Read + validate config from the environment. Exits-worthy errors are thrown. */
export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpClientConfig {
  const raw = env.DEVDIGEST_API_URL ?? DEFAULT_BASE_URL;
  try {
    new URL(raw);
  } catch {
    throw new Error(`DEVDIGEST_API_URL is not a valid URL: "${raw}"`);
  }
  const n = Number(env.MCP_RUN_TIMEOUT_MS);
  const runTimeoutMs = Number.isFinite(n) && n > 0 ? n : DEFAULT_RUN_TIMEOUT_MS;
  return { baseUrl: raw.replace(/\/+$/, ''), runTimeoutMs };
}

/** Pull the actionable message out of the API's `{ error: { message } }` body. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // non-JSON body — fall through
  }
  return `${res.status} ${res.statusText}`;
}

export function createHttpClient(cfg: HttpClientConfig): ToolDeps {
  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // ECONNREFUSED / DNS / abort — never reached the API.
      throw new ApiError(
        0,
        `Cannot reach DevDigest API at ${cfg.baseUrl} — start it with ./scripts/dev.sh`,
      );
    }
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    return res.json();
  }

  return {
    async listAgents(): Promise<Agent[]> {
      return (await call('/agents', { method: 'GET' }, READ_TIMEOUT_MS)) as Agent[];
    },

    async runAgentOnPr(input): Promise<RunSyncResult> {
      const body = (await call(
        '/reviews/run-sync',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
        cfg.runTimeoutMs + CLIENT_TIMEOUT_MARGIN_MS,
      )) as Record<string, unknown>;
      // The outcome shape always carries `findings`; the timeout shape does not.
      if (body && typeof body === 'object' && 'findings' in body) {
        return { kind: 'outcome', outcome: body as unknown as RunOutcome };
      }
      return { kind: 'running', run_id: String(body.run_id) };
    },

    async getOutcome(runId): Promise<RunOutcome | undefined> {
      try {
        return (await call(
          `/runs/${encodeURIComponent(runId)}/outcome`,
          { method: 'GET' },
          READ_TIMEOUT_MS,
        )) as RunOutcome;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return undefined;
        throw err;
      }
    },

    async getConventions(repo): Promise<ConventionCandidate[]> {
      const body = (await call(
        `/conventions?repo=${encodeURIComponent(repo)}`,
        { method: 'GET' },
        READ_TIMEOUT_MS,
      )) as { conventions: ConventionCandidate[] };
      return body.conventions;
    },

    async getBlastRadius(input: { repo: string; pr: number }): Promise<BlastResponse> {
      return (await call(
        `/blast?repo=${encodeURIComponent(input.repo)}&pr=${input.pr}`,
        { method: 'GET' },
        READ_TIMEOUT_MS,
      )) as BlastResponse;
    },
  };
}
