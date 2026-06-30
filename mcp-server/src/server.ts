import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDeps } from './deps.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

/**
 * Build the MCP server and register all five DevDigest tools. Transport-agnostic
 * — the caller connects a transport (stdio in `index.ts`).
 */
export function createMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);
  return server;
}
