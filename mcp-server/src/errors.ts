import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool result helpers + the transport error type.
 *  - `toolOk(structured)` — success: structured content (validated against the
 *    tool's outputSchema) plus a JSON text block for non-structured clients.
 *  - `toolError(message)` — an `isError` result whose text **leads onward**
 *    (names the next tool/step), never a bare code.
 *  - `ApiError` / `toolErrorFromApi` — map an HTTP/transport failure to an
 *    actionable `isError` result (R7).
 */

/**
 * A non-2xx response, or a failure to reach the API at all. `status === 0`
 * means the request never got a response (connection refused / DNS / abort);
 * the `message` already carries the actionable "start the API" hint.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toolOk(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

/** Success result that carries both structured content AND a human hint line. */
export function toolOkWithNote(structured: Record<string, unknown>, note: string): CallToolResult {
  return {
    content: [{ type: 'text', text: note }],
    structuredContent: structured,
  };
}

export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Map a thrown error to an actionable tool error. `ApiError` cases lead onward:
 * unreachable → start the API; 404 → pass through the server's actionable
 * message; other statuses → a generic "check server logs". Non-`ApiError`
 * throwables surface their message rather than crash the tool call.
 */
export function toolErrorFromApi(err: unknown): CallToolResult {
  if (err instanceof ApiError) {
    if (err.status === 0) return toolError(err.message);
    if (err.status === 404) return toolError(err.message);
    return toolError(`DevDigest API error (${err.status}): ${err.message}`);
  }
  return toolError(err instanceof Error ? err.message : String(err));
}
