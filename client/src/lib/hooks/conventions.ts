/* hooks/conventions.ts — React Query hooks for the Conventions page: run the
   repo extraction, list candidates, accept/reject/edit them, and merge accepted
   ones into a `source: extracted` Skill (optionally linked to an agent). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, Skill, SkillType } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run the two-step extraction pipeline; replaces the cached candidate list. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: { accepted?: boolean; rule?: string; evidence_snippet?: string };
}

/** Accept or inline-edit a single candidate. */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

/** Reject (remove) a candidate. */
export function useRejectConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface ConventionSkillDraft {
  name: string;
  description: string;
  body: string;
}

/** Fetch the default skill name/description/body merged from accepted candidates. */
export function useDraftConventionSkill(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill/draft`),
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
  agent_id?: string;
}

/** Create the merged skill from the repo's accepted candidates. */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
