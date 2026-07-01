import { z } from 'zod';
import { Finding } from '@devdigest/shared';

/**
 * Package-local MCP transport contracts. These are NOT added to the vendored
 * `@devdigest/shared` (which is hand-synced and do-not-touch) — they are
 * composed FROM it via `.pick()` so the wire shapes stay in lockstep with the
 * canonical Finding contract while staying lean (high-signal fields only).
 */

/** The concise, high-signal projection of a Finding returned over MCP. */
export const McpFinding = Finding.pick({
  severity: true,
  category: true,
  title: true,
  file: true,
  start_line: true,
  end_line: true,
  suggestion: true,
});
export type McpFinding = z.infer<typeof McpFinding>;

/**
 * Map an API-serialised finding (snake_case fields) to the lean MCP shape. The
 * severity/category arrive as strings over HTTP; the SDK validates the result
 * against the tool's `outputSchema`, so the cast is checked downstream.
 */
export function toMcpFinding(f: {
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  suggestion?: string | null;
}): McpFinding {
  return {
    severity: f.severity as McpFinding['severity'],
    category: f.category as McpFinding['category'],
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    suggestion: f.suggestion ?? null,
  };
}
