import type { CSSProperties } from "react";

export const s = {
  /** Two-column row: Intent + Blast Radius side by side; collapses to single
   *  column below ~700 px (each panel is min 280 px). */
  panelRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  panelCol: {
    minWidth: 0, // prevent grid blowout from long monospace strings
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
