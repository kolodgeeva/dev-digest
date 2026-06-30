import { describe, it, expect } from 'vitest';
import { runAgentOnPrHandler } from '../run-agent-on-pr.js';
import { ApiError } from '../../errors.js';
import { makeDeps, outcome } from './fixtures.js';

const input = { repo: 'acme/api', pr: 482, agent: 'a1' };

describe('run_agent_on_pr', () => {
  it('runs, waits, and returns the concise outcome', async () => {
    const deps = makeDeps({
      runAgentOnPr: async () => ({ kind: 'outcome', outcome: outcome() }),
    });
    const res = await runAgentOnPrHandler(deps)(input);
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { status: string; findings: unknown[]; verdict: string };
    expect(out.status).toBe('done');
    expect(out.verdict).toBe('request_changes');
    expect(out.findings).toHaveLength(1);
  });

  it('passes through the API’s actionable error for an unknown agent', async () => {
    const deps = makeDeps({
      runAgentOnPr: async () => {
        throw new ApiError(404, 'agent "a1" not found — call list_agents to get a valid agent id');
      },
    });
    const res = await runAgentOnPrHandler(deps)(input);
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/list_agents/);
  });

  it('passes through the API’s actionable error when the PR is not imported', async () => {
    const deps = makeDeps({
      runAgentOnPr: async () => {
        throw new ApiError(404, `repo "acme/api" PR #482 isn't imported yet — add the repo`);
      },
    });
    const res = await runAgentOnPrHandler(deps)(input);
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/isn.t imported/);
  });

  it('surfaces a reachability hint when the API is down', async () => {
    const deps = makeDeps({
      runAgentOnPr: async () => {
        throw new ApiError(0, 'Cannot reach DevDigest API at http://localhost:3001 — start it with ./scripts/dev.sh');
      },
    });
    const res = await runAgentOnPrHandler(deps)(input);
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/Cannot reach DevDigest API/);
  });

  it('falls back to { status: running, run_id } when the run outlives the server wait', async () => {
    const deps = makeDeps({
      runAgentOnPr: async () => ({ kind: 'running', run_id: 'run-1' }),
    });
    const res = await runAgentOnPrHandler(deps)(input);
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { status: string; run_id: string; findings: unknown[] };
    expect(out.status).toBe('running');
    expect(out.run_id).toBe('run-1');
    expect(out.findings).toEqual([]);
  });
});
