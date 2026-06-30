import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadHttpConfig, createHttpClient } from './http-client.js';
import { createMcpServer } from './server.js';

/**
 * DevDigest MCP server entrypoint (stdio). Under R8 the server is a thin HTTP
 * client of the running DevDigest API — there is no DB handle or Container to
 * close, so shutdown just exits.
 *
 * NOTE: stdout is the MCP protocol channel — all diagnostics MUST go to stderr
 * (console.error), never stdout.
 */
async function main(): Promise<void> {
  const config = loadHttpConfig();
  const deps = createHttpClient(config);
  const server = createMcpServer(deps);

  const shutdown = () => process.exit(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[devdigest-mcp] ready on stdio → ${config.baseUrl}`);
}

main().catch((err) => {
  console.error('[devdigest-mcp] fatal:', err);
  process.exit(1);
});
