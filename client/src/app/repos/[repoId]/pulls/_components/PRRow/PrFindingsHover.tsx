/* PrFindingsHover — popover body for a PR row's Findings column. Lazily fetches
   the PR's persisted reviews (only mounted while the HoverCard is open) and
   shows the LATEST review's findings — the same review the column's badge
   counts come from (server `findings_summary`). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPopover } from "@/components/FindingsPopover";
import type { SeverityCounts } from "@/components/FindingsSummary";
import { routes } from "@/lib/routes";

export function PrFindingsHover({
  prId,
  repoId,
  prNumber,
  activeSeverity,
}: {
  prId: string;
  /** Used to deep-link a clicked finding to the PR detail's Findings tab. */
  repoId: string;
  prNumber: number;
  /** When set, show only this severity's findings (clicked badge filter). */
  activeSeverity?: keyof SeverityCounts | null;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data, isLoading } = usePrReviews(prId);

  if (isLoading) {
    return (
      <div style={{ padding: "8px", fontSize: 13, color: "var(--text-secondary)" }}>
        {t("findingsPopover.loading")}
      </div>
    );
  }
  // Reviews come back newest-first → [0] is the latest review (matches badges).
  const findings = data?.[0]?.findings ?? [];
  const shown = activeSeverity ? findings.filter((f) => f.severity === activeSeverity) : findings;
  return (
    <FindingsPopover
      findings={shown}
      onFindingClick={(f) =>
        router.push(`${routes.pull(repoId, prNumber)}?tab=findings&finding=${encodeURIComponent(f.id)}`)
      }
    />
  );
}

export default PrFindingsHover;
