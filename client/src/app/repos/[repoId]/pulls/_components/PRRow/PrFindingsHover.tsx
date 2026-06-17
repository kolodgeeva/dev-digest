/* PrFindingsHover — popover body for a PR row's Findings column. Lazily fetches
   the PR's persisted reviews (only mounted while the HoverCard is open) and
   shows the LATEST review's findings — the same review the column's badge
   counts come from (server `findings_summary`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPopover } from "@/components/findings-popover";

export function PrFindingsHover({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
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
  return <FindingsPopover findings={findings} />;
}

export default PrFindingsHover;
