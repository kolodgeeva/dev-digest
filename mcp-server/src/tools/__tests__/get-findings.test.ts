import { describe, it, expect } from 'vitest';
import { getFindingsHandler } from '../get-findings.js';
import { makeDeps, outcome, finding } from './fixtures.js';

describe('get_findings', () => {
  it('returns an actionable error for an unknown run', async () => {
    const res = await getFindingsHandler(makeDeps())({ run_id: 'nope' });
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/run_agent_on_pr/);
  });

  it('concise (default): summary-first counts, no finding bodies', async () => {
    const deps = makeDeps({
      getOutcome: async () =>
        outcome({
          findings: [
            finding({ severity: 'CRITICAL' }),
            finding({ severity: 'WARNING' }),
            finding({ severity: 'WARNING' }),
          ],
        }),
    });
    const res = await getFindingsHandler(deps)({ run_id: 'run-1' });
    const out = res.structuredContent as {
      verdict: string;
      findings_total: number;
      findings_summary: { CRITICAL: number; WARNING: number; SUGGESTION: number };
      findings: unknown[];
      next_cursor: string | null;
    };
    expect(out.verdict).toBe('request_changes');
    expect(out.findings_total).toBe(3);
    expect(out.findings_summary).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
    expect(out.findings).toEqual([]);
    expect(out.next_cursor).toBeNull();
  });

  it('detailed: full findings, paginated', async () => {
    const deps = makeDeps({
      getOutcome: async () =>
        outcome({ findings: [finding({ title: 'A' }), finding({ title: 'B' })] }),
    });
    const res = await getFindingsHandler(deps)({
      run_id: 'run-1',
      response_format: 'detailed',
      limit: 1,
    });
    const out = res.structuredContent as {
      findings_total: number;
      findings: { title: string }[];
      next_cursor: string | null;
    };
    expect(out.findings_total).toBe(2);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.title).toBe('A');
    expect(out.next_cursor).toBeTypeOf('string');
  });

  it('reports a still-running run with empty findings (not an error)', async () => {
    const deps = makeDeps({
      getOutcome: async () =>
        outcome({ status: 'running', verdict: null, score: null, summary: null, findings: [] }),
    });
    const res = await getFindingsHandler(deps)({ run_id: 'run-1' });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { status: string; findings: unknown[] };
    expect(out.status).toBe('running');
    expect(out.findings).toEqual([]);
  });
});
