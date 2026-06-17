/**
 * USD cost badge formatting, shared across the PR list, run timeline, and run
 * trace drawer.
 *
 * Renders "—" — NOT "$0.00" — when a run has no priced cost (unknown model or a
 * failed run), so an unpriced run is never confused with a free one. Sub-cent
 * costs get 4 decimals so they don't collapse to "$0.00".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;
}
