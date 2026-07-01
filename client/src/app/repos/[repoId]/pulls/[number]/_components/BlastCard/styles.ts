import type { CSSProperties } from "react";

/** Co-located styles for BlastCard. Mirrors the IntentCard approach. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    gap: 4,
  } satisfies CSSProperties,

  // ---- summary stat row ----
  statRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 18,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
  } satisfies CSSProperties,
  statCount: {
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  statLabel: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- symbol tree ----
  tree: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  symbolBlock: {
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    font: "inherit",
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  symbolCount: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingLeft: 7,
    paddingBottom: 12,
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  connector: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    color: "var(--border-strong, var(--text-muted))",
    userSelect: "none",
  } satisfies CSSProperties,
  pills: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 22,
  } satisfies CSSProperties,

  // ---- states ----
  degradedRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  degradedHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,
  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,
  graphPlaceholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
    textAlign: "center",
    padding: "24px 0",
    margin: 0,
  } satisfies CSSProperties,
  skeletonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
