import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  topRow: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  rule: { flex: 1, fontSize: 15, fontWeight: 600, fontStyle: "italic", margin: 0 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 6, width: 150, flexShrink: 0 } satisfies CSSProperties,
  evidence: {
    marginTop: 12,
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg)",
  } satisfies CSSProperties,
  evidenceHead: {
    padding: "7px 12px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    overflowX: "auto",
    whiteSpace: "pre",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 14 } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)", width: 78 } satisfies CSSProperties,
  bar: { flex: 1 } satisfies CSSProperties,
  pct: { fontSize: 12, color: "var(--text-secondary)", width: 38, textAlign: "right" } satisfies CSSProperties,
  editRow: { marginTop: 12, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
