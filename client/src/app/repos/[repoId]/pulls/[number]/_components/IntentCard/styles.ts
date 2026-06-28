import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,
  // IN SCOPE | OUT OF SCOPE sit side-by-side; collapse to one column when narrow.
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    columnGap: 28,
    rowGap: 16,
  } satisfies CSSProperties,
  subheading: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  subheadingOk: {
    color: "var(--ok)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  listItem: {
    fontSize: 13,
    color: "var(--text-primary)",
    lineHeight: 1.45,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  } satisfies CSSProperties,
  // out-of-scope rows read as de-emphasised, matching the mock
  listItemMuted: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  } satisfies CSSProperties,
  checkIcon: {
    color: "var(--ok)",
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,
  xIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,
  skeletonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
