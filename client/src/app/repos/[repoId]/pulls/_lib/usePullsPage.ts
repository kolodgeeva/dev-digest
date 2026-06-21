/* Data, URL state (?status) and client-side filter/sort for the PR list route.
   Keeps page.tsx to pure JSX. Search query + sort are transient UI state (not in
   the URL), matching the original behaviour. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { routes } from "@/lib/routes";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

/** Open PRs carry a derived review status; everything else is merged/closed. */
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

export function usePullsPage() {
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  // Default to "needs review" — the most actionable filter on open.
  const status = search.get("status") ?? "needs_review";
  const setStatus = (k: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("status", k); // always explicit so "all" sticks over the needs_review default
    router.replace(`${routes.pulls(repoId)}?${sp.toString()}`);
  };

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");

  const q = query.trim().toLowerCase();
  const filtered = (pulls ?? [])
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });

  const repoName = activeRepo?.full_name ?? repoId;
  const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
  const needsReviewCount = (pulls ?? []).filter((p) => p.status === "needs_review").length;

  useDocumentTitle(repoName);

  return {
    repoId,
    repoName,
    repoNotFound,
    pulls,
    isLoading,
    isError,
    error,
    refetch,
    refresh,
    status,
    setStatus,
    query,
    setQuery,
    sort,
    setSort,
    filtered,
    openCount,
    needsReviewCount,
  };
}
