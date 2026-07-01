import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { runAgentOnPrInput, runAgentOnPrOutput } from '../contracts/tools.js';
import { toMcpFinding } from '../contracts/common.js';
import { toolOk, toolErrorFromApi } from '../errors.js';

/**
 * The single write tool. Under R8 the create → wait → collect loop lives on the
 * server (`POST /reviews/run-sync`), where the in-process `runBus` provides a
 * non-polling wait. This handler is one API call: it either gets the finished
 * outcome back, or a `run_id` to fetch later if the review outran the server's
 * wait. Unknown-agent / unimported-PR surface as actionable 404s from the API.
 */
export function runAgentOnPrHandler(deps: ToolDeps) {
  return async (input: { repo: string; pr: number; agent: string }): Promise<CallToolResult> => {
    let result;
    try {
      result = await deps.runAgentOnPr(input);
    } catch (err) {
      return toolErrorFromApi(err);
    }

    if (result.kind === 'running') {
      return toolOk({
        status: 'running',
        run_id: result.run_id,
        verdict: null,
        score: null,
        summary: null,
        error: null,
        findings: [],
        message: `review still running — fetch it later with devdigest_get_findings(run_id: "${result.run_id}")`,
      });
    }

    const outcome = result.outcome;
    return toolOk({
      status: outcome.status === 'failed' ? 'failed' : 'done',
      run_id: outcome.run_id,
      verdict: outcome.verdict,
      score: outcome.score,
      summary: outcome.summary,
      error: outcome.error,
      findings: outcome.findings.map(toMcpFinding),
      message: null,
    });
  };
}

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_run_agent_on_pr',
    {
      title: 'Run a reviewer agent on a pull request',
      description:
        'Run one reviewer agent on a pull request and return the finished review: { verdict, findings[] }. This is the only write tool — it creates a run, waits for it, and returns the outcome in a single call. Pass repo ("owner/name"), pr (number), and agent (id from devdigest_list_agents) as flat values. If the review outlives the internal timeout (≤120s), it returns { status: "running", run_id } — fetch the result later with devdigest_get_findings.',
      inputSchema: runAgentOnPrInput,
      outputSchema: runAgentOnPrOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    runAgentOnPrHandler(deps),
  );
}
