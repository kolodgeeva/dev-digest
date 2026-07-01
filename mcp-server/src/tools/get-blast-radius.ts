import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { getBlastRadiusInput, getBlastRadiusOutput } from '../contracts/tools.js';
import { toolOk, toolErrorFromApi } from '../errors.js';

/**
 * Returns a PR's blast radius — the set of changed symbols, their downstream
 * callers (with `file:line` links), and the HTTP endpoints reachable from those
 * callers — read from the repo-intel index. Deterministic, no LLM calls.
 */
export function getBlastRadiusHandler(deps: ToolDeps) {
  return async (input: { repo: string; pr: number }): Promise<CallToolResult> => {
    let blast;
    try {
      blast = await deps.getBlastRadius(input);
    } catch (err) {
      return toolErrorFromApi(err);
    }

    // Flat de-duplicated union of all endpoints across downstream entries.
    const impacted_endpoints = [
      ...new Set(blast.downstream.flatMap((d) => d.endpoints_affected)),
    ];

    return toolOk({
      status: blast.degraded ? 'degraded' : 'ok',
      repo: input.repo,
      pr: input.pr,
      summary: blast.summary,
      changed_symbols: blast.changed_symbols,
      downstream: blast.downstream,
      impacted_endpoints,
      degraded: blast.degraded,
      reason: blast.reason,
    });
  };
}

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: "Get a PR's blast radius",
      description:
        'Returns a PR\'s impact map (changed symbols → downstream callers → impacted endpoints) read from the repo-intel index. Read-only — no LLM calls. Pass repo as "owner/name" and pr as the pull request number.',
      inputSchema: getBlastRadiusInput,
      outputSchema: getBlastRadiusOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    getBlastRadiusHandler(deps),
  );
}
