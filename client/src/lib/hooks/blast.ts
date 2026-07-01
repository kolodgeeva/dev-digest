/* hooks/blast.ts — React Query hook for the Blast Radius panel.
   useBlast fetches the blast radius data (or null on 404, treating
   "index not yet built" as empty state). Query key: ["blast", prId];
   invalidated by usePrDetailPage's onRunDone after a review run so the
   panel refreshes when new repo-intel data is available. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/**
 * BlastResponse extends the shared BlastRadius contract with the
 * server-side degraded/reason fields. These are omitted from vendor/shared
 * (do-not-touch) since they are implementation details of the API envelope,
 * not the core contract used by other packages.
 */
export type BlastResponse = BlastRadius & {
  degraded: boolean;
  reason: string | null;
};

/** GET /pulls/:id/blast → BlastResponse or null (404 = index not yet built). */
export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: async () => {
      try {
        return await api.get<BlastResponse>(`/pulls/${prId}/blast`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
  });
}
