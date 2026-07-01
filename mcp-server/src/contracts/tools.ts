import { z } from 'zod';
import { Verdict } from '@devdigest/shared';
import { McpFinding } from './common.js';

/**
 * Zod *raw shapes* (plain objects of validators) for each tool's input and
 * output. The MCP SDK's `registerTool` takes raw shapes — NOT `z.object(...)`
 * — for `inputSchema`/`outputSchema`, and derives `structuredContent`
 * validation + the handler's argument types from them.
 */

const cursor = z.string().describe('Opaque pagination cursor from a previous response.').optional();
const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .describe('Max items to return (default 20).')
  .optional();

// ---- list_agents ----------------------------------------------------------
export const listAgentsInput = { cursor, limit };
export const listAgentsOutput = {
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      model: z.string(),
    }),
  ),
  next_cursor: z.string().nullable(),
};

// ---- run_agent_on_pr ------------------------------------------------------
export const runAgentOnPrInput = {
  repo: z.string().min(1).describe('Repository full name, "owner/name".'),
  pr: z.number().int().positive().describe('Pull request number.'),
  agent: z.string().min(1).describe('Agent id (from devdigest_list_agents).'),
};
export const runAgentOnPrOutput = {
  status: z.enum(['done', 'failed', 'running']),
  run_id: z.string(),
  verdict: Verdict.nullable(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  findings: z.array(McpFinding),
  /** Set only on the timeout (`running`) path; null otherwise. */
  message: z.string().nullable(),
};

// ---- get_findings ---------------------------------------------------------
export const getFindingsInput = {
  run_id: z.string().min(1).describe('The run id returned by devdigest_run_agent_on_pr.'),
  response_format: z
    .enum(['concise', 'detailed'])
    .describe(
      '"concise" (default) returns the verdict, summary and per-severity finding counts only; "detailed" returns the full findings, paginated.',
    )
    .optional(),
  cursor,
  limit,
};
export const getFindingsOutput = {
  status: z.string().nullable(),
  verdict: Verdict.nullable(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  /** Total findings on the run (independent of pagination / response_format). */
  findings_total: z.number(),
  /** Per-severity counts — the summary-first signal for large runs. */
  findings_summary: z.object({
    CRITICAL: z.number(),
    WARNING: z.number(),
    SUGGESTION: z.number(),
  }),
  /** Empty in "concise" mode; the paginated page in "detailed" mode. */
  findings: z.array(McpFinding),
  next_cursor: z.string().nullable(),
};

// ---- get_conventions ------------------------------------------------------
export const getConventionsInput = {
  repo: z.string().min(1).describe('Repository full name, "owner/name".'),
};
export const getConventionsOutput = {
  repo: z.string(),
  conventions: z.array(
    z.object({
      rule: z.string(),
      evidence_path: z.string(),
      confidence: z.number(),
      accepted: z.boolean(),
    }),
  ),
};

// ---- get_blast_radius -----------------------------------------------------
export const getBlastRadiusInput = {
  repo: z.string().min(1).describe('Repository full name, "owner/name".'),
  pr: z.number().int().positive().describe('Pull request number.'),
};
export const getBlastRadiusOutput = {
  status: z.enum(['ok', 'degraded']),
  repo: z.string(),
  pr: z.number(),
  summary: z.string(),
  changed_symbols: z.array(
    z.object({ name: z.string(), file: z.string(), kind: z.string() }),
  ),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(
        z.object({ name: z.string(), file: z.string(), line: z.number() }),
      ),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  /** Flat de-duplicated union of all downstream endpoints — the quick "what breaks" signal. */
  impacted_endpoints: z.array(z.string()),
  degraded: z.boolean(),
  reason: z.string().nullable(),
};
