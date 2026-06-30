import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { listAgentsInput, listAgentsOutput } from '../contracts/tools.js';
import { paginate } from '../pagination.js';
import { toolOk, toolErrorFromApi } from '../errors.js';

const DEFAULT_LIMIT = 20;

export function listAgentsHandler(deps: ToolDeps) {
  return async (input: { cursor?: string; limit?: number }): Promise<CallToolResult> => {
    let all;
    try {
      all = await deps.listAgents();
    } catch (err) {
      return toolErrorFromApi(err);
    }
    const { page, nextCursor } = paginate(all, input.cursor, input.limit ?? DEFAULT_LIMIT);
    return toolOk({
      agents: page.map((a) => ({ id: a.id, name: a.name, enabled: a.enabled, model: a.model })),
      next_cursor: nextCursor,
    });
  };
}

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      title: 'List reviewer agents',
      description:
        'List the reviewer agents configured in this DevDigest workspace (id, name, enabled, model). Use this to get a valid `agent` id before calling devdigest_run_agent_on_pr. Read-only; paginated.',
      inputSchema: listAgentsInput,
      outputSchema: listAgentsOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    listAgentsHandler(deps),
  );
}
