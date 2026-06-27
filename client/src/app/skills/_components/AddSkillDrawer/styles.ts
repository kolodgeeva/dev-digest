import type { CSSProperties } from "react";

/** Co-located styles for the "Add a skill" import drawer. */
export const s = {
  tabsBar: { marginBottom: 16 } satisfies CSSProperties,
  field: { marginBottom: 16 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 } satisfies CSSProperties,
  // Community browser
  catalogSearch: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 12,
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  cols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, minHeight: 280 } satisfies CSSProperties,
  cardList: { display: "flex", flexDirection: "column", gap: 8, overflow: "auto", maxHeight: 420 } satisfies CSSProperties,
  card: (active: boolean): CSSProperties => ({
    textAlign: "left",
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  cardName: { fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  cardDesc: { fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 } satisfies CSSProperties,
  cardMeta: { fontSize: 12, color: "var(--text-secondary)", marginTop: 6, display: "flex", gap: 10 } satisfies CSSProperties,
  preview: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
    overflow: "auto",
    maxHeight: 420,
  } satisfies CSSProperties,
  previewEmpty: { display: "grid", placeItems: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
