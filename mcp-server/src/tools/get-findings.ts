import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { getFindingsInput, getFindingsOutput } from '../contracts/tools.js';
import { toMcpFinding } from '../contracts/common.js';
import { paginate } from '../pagination.js';
import { toolOk, toolError, toolErrorFromApi } from '../errors.js';

const DEFAULT_LIMIT = 20;

export function getFindingsHandler(deps: ToolDeps) {
  return async (
    input: {
      run_id: string;
      response_format?: 'concise' | 'detailed';
      cursor?: string;
      limit?: number;
    },
  ): Promise<CallToolResult> => {
    let outcome;
    try {
      outcome = await deps.getOutcome(input.run_id);
    } catch (err) {
      return toolErrorFromApi(err);
    }
    if (!outcome) {
      return toolError('run not found — run an agent first with devdigest_run_agent_on_pr');
    }

    const all = outcome.findings;
    const findingsSummary = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const f of all) {
      if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
        findingsSummary[f.severity] += 1;
      }
    }

    const base = {
      status: outcome.status,
      verdict: outcome.verdict,
      score: outcome.score,
      summary: outcome.summary,
      error: outcome.error,
      findings_total: all.length,
      findings_summary: findingsSummary,
    };

    // "concise" (default): verdict + summary + counts, summary-first — no finding
    // bodies. "detailed": the full findings, paginated.
    if ((input.response_format ?? 'concise') === 'concise') {
      return toolOk({ ...base, findings: [], next_cursor: null });
    }
    const { page, nextCursor } = paginate(all, input.cursor, input.limit ?? DEFAULT_LIMIT);
    return toolOk({ ...base, findings: page.map(toMcpFinding), next_cursor: nextCursor });
  };
}

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_findings',
    {
      title: 'Get findings for a review run',
      description:
        'Get the verdict + findings of an already-completed review run, by run_id. response_format "concise" (default) returns the verdict, summary and per-severity counts (summary-first); "detailed" returns the full findings, paginated. Use this to re-read a prior run, or to fetch a run that devdigest_run_agent_on_pr left still running.',
      inputSchema: getFindingsInput,
      outputSchema: getFindingsOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    getFindingsHandler(deps),
  );
}
