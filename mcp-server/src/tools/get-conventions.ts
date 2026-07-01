import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDeps } from '../deps.js';
import { getConventionsInput, getConventionsOutput } from '../contracts/tools.js';
import { toolOk, toolOkWithNote, toolErrorFromApi } from '../errors.js';

export function getConventionsHandler(deps: ToolDeps) {
  return async (input: { repo: string }): Promise<CallToolResult> => {
    let conventions;
    try {
      // An unknown repo surfaces as an actionable 404 from the API.
      conventions = await deps.getConventions(input.repo);
    } catch (err) {
      return toolErrorFromApi(err);
    }

    const result = {
      repo: input.repo,
      conventions: conventions.map((c) => ({
        rule: c.rule,
        evidence_path: c.evidence_path,
        confidence: c.confidence,
        accepted: c.accepted,
      })),
    };

    if (conventions.length === 0) {
      return toolOkWithNote(
        result,
        'no conventions extracted yet — run convention extraction for this repo in the DevDigest studio',
      );
    }
    return toolOk(result);
  };
}

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_conventions',
    {
      title: 'Get a repository’s conventions',
      description:
        'Get the vetted house conventions extracted for a repository (the L02 repo-conventions). Read-only — lists the already-extracted rules; it does not trigger extraction. Pass repo as "owner/name".',
      inputSchema: getConventionsInput,
      outputSchema: getConventionsOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    getConventionsHandler(deps),
  );
}
