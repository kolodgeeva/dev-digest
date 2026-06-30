import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { getBlastRadiusInput, getBlastRadiusOutput } from '../contracts/tools.js';
import { toolOk } from '../errors.js';

/**
 * STUB. The output shape mirrors a subset of `RepoIntel.BlastResult`
 * (changed_symbols / callers / impacted_endpoints) so wiring it later is
 * trivial: resolvePullRef(repo, pr) → getPrFiles(prId) →
 * container.repoIntel.getBlastRadius(repoId, changedFiles) → map the result.
 * `deps` is intentionally unused until then.
 */
export function getBlastRadiusHandler(_deps: ToolDeps) {
  return async (input: { repo: string; pr: number }): Promise<CallToolResult> => {
    return toolOk({
      status: 'not_implemented',
      repo: input.repo,
      pr: input.pr,
      message:
        'blast radius is not implemented yet; planned to wire to repo-intel getBlastRadius',
      changed_symbols: [],
      callers: [],
      impacted_endpoints: [],
    });
  };
}

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Get a PR’s blast radius (experimental — not implemented)',
      description:
        'EXPERIMENTAL / NOT IMPLEMENTED YET. Intended to return a PR’s impact map (changed symbols, callers, impacted endpoints). It always succeeds with { status: "not_implemented", … } and never throws — do NOT rely on its data or retry it; treat the result as unavailable. Pass repo ("owner/name") and pr (number).',
      inputSchema: getBlastRadiusInput,
      outputSchema: getBlastRadiusOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    getBlastRadiusHandler(deps),
  );
}
