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

  it('runAgentOnPr → POST /reviews/run-sync; outcome shape carries findings', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { run_id: 'run-1', status: 'done', findings: [] }),
    );
    const result = await createHttpClient(cfg).runAgentOnPr({ repo: 'a/b', pr: 1, agent: 'a1' });
    expect(result.kind).toBe('outcome');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/reviews/run-sync');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ repo: 'a/b', pr: 1, agent: 'a1' });
  });

  it('runAgentOnPr → maps the timeout shape (no findings) to { kind: running }', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { status: 'running', run_id: 'run-9' }),
    );
    const result = await createHttpClient(cfg).runAgentOnPr({ repo: 'a/b', pr: 1, agent: 'a1' });
    expect(result).toEqual({ kind: 'running', run_id: 'run-9' });
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
