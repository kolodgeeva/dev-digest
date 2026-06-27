import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 20,
    borderRadius: 7,
    background: "var(--bg-hover)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
