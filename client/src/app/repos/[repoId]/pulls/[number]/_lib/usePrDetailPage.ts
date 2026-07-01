/* All data-loading, URL state and run-lifecycle logic for the PR detail route.
   Keeps page.tsx a thin composition layer (loading/error branches + JSX).

   Notable behaviours preserved from the original page body:
   - The route is keyed by PR *number*, but every PR API is keyed by the row's
     uuid — resolve number → uuid via the (cached) pulls list before fetching.
   - Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
     navigation AND reload, and self-clears via polling when runs finish.
   - View state (?tab / ?trace) lives in the URL via setParam (null deletes). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import { usePullDetail, usePulls } from "@/lib/hooks";
import {
  usePrReviews,
  useCancelRun,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
} from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { githubPrUrl } from "@/lib/github-urls";
import { routes } from "@/lib/routes";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export function usePrDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;

  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  };
  const onRunDone = () => {
    invalidateActiveRuns();
    invalidateRunHistory();
    refetchReviews();
    // Smart Diff overlays the latest review's findings → refresh its badges too.
    if (prId) qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    // Blast Radius panel — invalidate so it picks up any updated repo-intel index.
    if (prId) qc.invalidateQueries({ queryKey: ["blast", prId] });
  };
  const onDeleteRun = (id: string) => {
    if (window.confirm("Delete this run from history? (its logs are removed too)"))
      deleteRun.mutate(id);
  };

  // ?finding=<id> deep-links a specific finding (from the PR-list popover): the
  // detail page opens its run accordion and scrolls/highlights the card. Default
  // the tab to findings so the deep-link lands on the right surface.
  const targetFindingId = search.get("finding");
  const tab = search.get("tab") ?? (targetFindingId ? "findings" : "overview");
  const traceRunId = search.get("trace");
  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`${routes.pull(repoId, number)}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  const setTab = (t: string) => setParam("tab", t);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: routes.pulls(repoId) },
    { label: "Pull Requests", href: routes.pulls(repoId) },
    { label: `#${number}`, mono: true },
  ];

  useDocumentTitle(pr ? `#${number} · ${repoName}` : null);

  return {
    repoId,
    number,
    repoNotFound,
    isLoading,
    isError,
    error,
    refetch,
    pr,
    prId,
    crumb,
    tab,
    traceRunId,
    targetFindingId,
    setParam,
    setTab,
    liveRunIds,
    reviewRunning,
    runs,
    prRuns,
    lethalTrifecta,
    findingsCount,
    repoFullName,
    githubUrl: (n: number) => (repoFullName ? githubPrUrl(repoFullName, n) : null),
    cancel,
    invalidateActiveRuns,
    onRunDone,
    onDeleteRun,
  };
}
