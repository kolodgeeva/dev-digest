import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpClient, loadHttpConfig } from '../../http-client.js';
import { ApiError } from '../../errors.js';

const cfg = { baseUrl: 'http://localhost:3001', runTimeoutMs: 1000 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Route mocked fetch by "METHOD path" so multi-step orchestration is easy to assert. */
function routedFetch(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(url).replace('http://localhost:3001', '');
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected fetch: ${key}`);
    return jsonResponse(200, routes[key]);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadHttpConfig', () => {
  it('defaults the base URL and strips a trailing slash', () => {
    expect(loadHttpConfig({} as NodeJS.ProcessEnv).baseUrl).toBe('http://localhost:3001');
    expect(loadHttpConfig({ DEVDIGEST_API_URL: 'http://api/' } as never).baseUrl).toBe('http://api');
  });

  it('throws on an invalid URL', () => {
    expect(() => loadHttpConfig({ DEVDIGEST_API_URL: 'not a url' } as never)).toThrow(/not a valid URL/);
  });
});

describe('DevDigest HTTP client', () => {
  it('listAgents → GET /agents', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, [{ id: 'a1', name: 'A', enabled: true, model: 'gpt-4o' }]),
    );
    const agents = await createHttpClient(cfg).listAgents();
    expect(agents).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:3001/agents');
  });

  it('runAgentOnPr → resolves ids, POSTs a review, polls the outcome', async () => {
    const fetchMock = routedFetch({
      'GET /repos': [{ id: 'r1', full_name: 'acme/api' }],
      'GET /repos/r1/pulls': [{ id: 'pr1', number: 482 }],
      'POST /pulls/pr1/review': { pr_id: 'pr1', runs: [{ run_id: 'run-1' }], reviews: [] },
      'GET /runs/run-1/outcome': { run_id: 'run-1', status: 'done', findings: [] },
    });
    const result = await createHttpClient(cfg).runAgentOnPr({ repo: 'acme/api', pr: 482, agent: 'a1' });
    expect(result).toEqual({
      kind: 'outcome',
      outcome: { run_id: 'run-1', status: 'done', findings: [] },
    });
    // POST body carried the agentId
    const post = fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ agentId: 'a1' });
  });

  it('runAgentOnPr → returns { kind: running } when the run outlives the deadline', async () => {
    routedFetch({
      'GET /repos': [{ id: 'r1', full_name: 'acme/api' }],
      'GET /repos/r1/pulls': [{ id: 'pr1', number: 482 }],
      'POST /pulls/pr1/review': { runs: [{ run_id: 'run-9' }] },
      'GET /runs/run-9/outcome': { run_id: 'run-9', status: 'running', findings: [] },
    });
    // runTimeoutMs: 0 → poll once, then give up without sleeping.
    const result = await createHttpClient({ ...cfg, runTimeoutMs: 0 }).runAgentOnPr({
      repo: 'acme/api',
      pr: 482,
      agent: 'a1',
    });
    expect(result).toEqual({ kind: 'running', run_id: 'run-9' });
  });

  it('runAgentOnPr → actionable ApiError when the repo is not found', async () => {
    routedFetch({ 'GET /repos': [] });
    await expect(
      createHttpClient(cfg).runAgentOnPr({ repo: 'ghost/x', pr: 1, agent: 'a1' }),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining('not found') });
  });

  it('getBlastRadius → resolves the PR id, then GET /pulls/:id/blast', async () => {
    const fetchMock = routedFetch({
      'GET /repos': [{ id: 'r1', full_name: 'acme/api' }],
      'GET /repos/r1/pulls': [{ id: 'pr1', number: 7 }],
      'GET /pulls/pr1/blast': { changed_symbols: [], downstream: [], summary: '', degraded: false, reason: null },
    });
    const blast = await createHttpClient(cfg).getBlastRadius({ repo: 'acme/api', pr: 7 });
    expect(blast.degraded).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/pulls/pr1/blast'))).toBe(true);
  });

  it('getConventions → resolves the repo id, then GET /repos/:id/conventions', async () => {
    const fetchMock = routedFetch({
      'GET /repos': [{ id: 'r1', full_name: 'acme/api' }],
      'GET /repos/r1/conventions': [{ rule: 'x', evidence_path: 'p', confidence: 1, accepted: true }],
    });
    const conventions = await createHttpClient(cfg).getConventions('acme/api');
    expect(conventions).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/repos/r1/conventions'))).toBe(true);
  });

  it('getOutcome → returns undefined on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: { code: 'not_found', message: 'Run not found' } }),
    );
    expect(await createHttpClient(cfg).getOutcome('nope')).toBeUndefined();
  });

  it('surfaces the API’s actionable message as an ApiError on 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: { code: 'not_found', message: 'repo not imported' } }),
    );
    await expect(createHttpClient(cfg).getConventions('a/b')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'repo not imported',
    });
  });

  it('maps a connection failure to a reachability ApiError (status 0)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(createHttpClient(cfg).listAgents()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('./scripts/dev.sh'),
    } satisfies Partial<ApiError>);
  });
});
