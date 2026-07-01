/* hooks/smart-diff.ts — React Query hook for the risk-ordered Smart Diff.
   GET /pulls/:id/smart-diff returns groups (core/wiring/boilerplate) + a split
   suggestion, composed server-side from pr_files + the latest review's findings.
   No LLM call — free by tokens. Query key: ["smart-diff", prId]; invalidated by
   usePrDetailPage's onRunDone so finding badges appear after a review. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
