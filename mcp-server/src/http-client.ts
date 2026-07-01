import type { Agent, ConventionCandidate } from '@devdigest/shared';
import type { ToolDeps, RunOutcome, RunSyncResult, BlastResponse } from './deps.js';
import { ApiError } from './errors.js';

/**
 * The DevDigest API HTTP client — the concrete implementation of `ToolDeps`. It
 * opens no DB, builds no Container, and holds no provider keys: reviews run
 * inside the API process. The MCP process needs only a base URL.
 *
 * The API exposes only general-purpose, id-keyed endpoints; this client does the
 * MULTI-STEP ORCHESTRATION behind the `ToolDeps` methods — resolving
 * `owner/name` + PR number to ids (`GET /repos`, `GET /repos/:id/pulls`),
 * starting a run (`POST /pulls/:id/review`) and polling its outcome
 * (`GET /runs/:id/outcome`). There is no MCP-specific aggregate endpoint.
 *
 * The local API uses `LocalNoAuthProvider`, so these calls carry no auth header.
 */

export interface HttpClientConfig {
  /** API base URL, e.g. `http://localhost:3001` (no trailing slash). */
  baseUrl: string;
  /**
   * How long `runAgentOnPr` polls `/runs/:id/outcome` before returning
   * `{ kind: 'running', run_id }` for the caller to fetch later.
   */
  runTimeoutMs: number;
}

const DEFAULT_BASE_URL = 'http://localhost:3001';
const DEFAULT_RUN_TIMEOUT_MS = 120_000;
/** Delay between run-outcome polls. */
const POLL_INTERVAL_MS = 2_000;
/** Each individual call returns promptly; fail fast if the API hangs. */
const READ_TIMEOUT_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

  // ---- ref resolution (owner/name + PR number → ids) ----------------------

  async function resolveRepoId(repo: string): Promise<string> {
    const rows = (await call('/repos', { method: 'GET' }, READ_TIMEOUT_MS)) as {
      id: string;
      full_name: string;
    }[];
    const match = rows.find((r) => r.full_name === repo);
    if (!match) {
      throw new ApiError(404, `repo "${repo}" not found — add it in the DevDigest studio first`);
    }
    return match.id;
  }

  async function resolvePrId(repo: string, pr: number): Promise<string> {
    const repoId = await resolveRepoId(repo);
    const rows = (await call(
      `/repos/${encodeURIComponent(repoId)}/pulls`,
      { method: 'GET' },
      READ_TIMEOUT_MS,
    )) as { id?: string | null; number: number }[];
    const match = rows.find((p) => p.number === pr && p.id);
    if (!match?.id) {
      throw new ApiError(
        404,
        `PR #${pr} not found in "${repo}" — sync the repo's PRs in the DevDigest studio first`,
      );
    }
    return match.id;
  }

  /** `GET /runs/:id/outcome` — `undefined` on 404 (run not found yet). */
  async function fetchOutcome(runId: string): Promise<RunOutcome | undefined> {
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
  }

  return {
    async listAgents(): Promise<Agent[]> {
      return (await call('/agents', { method: 'GET' }, READ_TIMEOUT_MS)) as Agent[];
    },

    async runAgentOnPr(input): Promise<RunSyncResult> {
      // 1. resolve the PR id, then 2. start one review run.
      const prId = await resolvePrId(input.repo, input.pr);
      const body = (await call(
        `/pulls/${encodeURIComponent(prId)}/review`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: input.agent }),
        },
        READ_TIMEOUT_MS,
      )) as { runs?: { run_id: string }[] };
      const runId = body.runs?.[0]?.run_id;
      if (!runId) throw new ApiError(500, 'the review did not start a run');

      // 3. poll the outcome until the run is terminal or the deadline passes.
      const deadline = Date.now() + cfg.runTimeoutMs;
      let outcome = await fetchOutcome(runId);
      while ((!outcome || outcome.status === 'running') && Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        outcome = await fetchOutcome(runId);
      }
      if (outcome && outcome.status !== 'running') return { kind: 'outcome', outcome };
      return { kind: 'running', run_id: runId };
    },

    getOutcome(runId): Promise<RunOutcome | undefined> {
      return fetchOutcome(runId);
    },

    async getConventions(repo): Promise<ConventionCandidate[]> {
      const repoId = await resolveRepoId(repo);
      return (await call(
        `/repos/${encodeURIComponent(repoId)}/conventions`,
        { method: 'GET' },
        READ_TIMEOUT_MS,
      )) as ConventionCandidate[];
    },

    async getBlastRadius(input): Promise<BlastResponse> {
      const prId = await resolvePrId(input.repo, input.pr);
      return (await call(
        `/pulls/${encodeURIComponent(prId)}/blast`,
        { method: 'GET' },
        READ_TIMEOUT_MS,
      )) as BlastResponse;
    },
  };
}
