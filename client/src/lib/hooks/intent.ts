/* hooks/intent.ts — React Query hooks for PR intent.
   useIntent fetches the stored intent (or null when not yet computed, treating
   a 404 as empty state). useRecomputeIntent triggers (re-)computation via POST.
   Query key: ["intent", prId] — invalidated by useRecomputeIntent on success. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { Intent } from "@devdigest/shared";

/** GET /pulls/:id/intent → stored Intent or null (404 = not computed yet). */
export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: async () => {
      try {
        return await api.get<Intent>(`/pulls/${prId}/intent`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
  });
}

/** POST response: the recomputed intent plus token-savings telemetry. */
interface RecomputeIntentResponse {
  intent: Intent;
  token_savings: {
    full_diff_tokens: number;
    classifier_tokens: number;
    saved: number;
  };
}

/** POST /pulls/:id/intent/recompute → triggers intent (re-)computation and
    immediately writes the recomputed Intent into the ["intent", prId] cache.
    The endpoint returns { intent, token_savings }, so we cache `data.intent`
    (not the whole envelope) to match what useIntent stores. */
export function useRecomputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<RecomputeIntentResponse>(`/pulls/${prId}/intent/recompute`),
    onSuccess: (data) => qc.setQueryData(["intent", prId], data.intent),
  });
}
