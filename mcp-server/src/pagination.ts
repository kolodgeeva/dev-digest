/**
 * Opaque, offset-based cursor pagination shared by `list_agents` and
 * `get_findings`. The cursor is a base64 of `{ o: <offset> }` so callers treat
 * it as an opaque token; a malformed/empty cursor safely restarts at 0.
 */

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { o?: unknown };
    return typeof parsed.o === 'number' && parsed.o >= 0 ? Math.floor(parsed.o) : 0;
  } catch {
    return 0;
  }
}

export function paginate<T>(
  items: T[],
  cursor: string | undefined,
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const start = decodeCursor(cursor);
  const page = items.slice(start, start + limit);
  const nextStart = start + limit;
  return { page, nextCursor: nextStart < items.length ? encodeCursor(nextStart) : null };
}
