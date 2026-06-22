import type { CSSProperties } from "react";

/** Co-located styles for SkillListItem (left-rail row in the Skills view). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.7,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  del: (pending: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  }),
  metaRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" } satisfies CSSProperties,
  typeChip: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "1px 7px",
    borderRadius: 4,
  } satisfies CSSProperties,
} as const;
