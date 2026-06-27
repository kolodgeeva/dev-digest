import type { CSSProperties } from "react";

export const s = {
  shell: { maxWidth: 920, margin: "0 auto", padding: "28px 28px 80px", width: "100%" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 8 } satisfies CSSProperties,
  headTexts: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  toolbar: { display: "flex", gap: 8, alignItems: "center", margin: "18px 0" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
