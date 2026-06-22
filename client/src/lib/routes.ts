/* Single source of truth for in-app URLs. Keeps route strings out of components
   so the file-system route structure and the links that point at it can't drift
   apart. Builders return the PATH only — callers append any query string
   themselves (e.g. `${routes.pulls(repoId)}?${sp}`). */

export const routes = {
  home: () => "/",
  onboarding: () => "/onboarding",
  pulls: (repoId: string) => `/repos/${repoId}/pulls`,
  pull: (repoId: string, number: number | string) => `/repos/${repoId}/pulls/${number}`,
  agents: () => "/agents",
  agent: (id: string, tab?: string) => (tab ? `/agents/${id}?tab=${tab}` : `/agents/${id}`),
  skills: () => "/skills",
  skill: (id: string, tab?: string) => (tab ? `/skills/${id}?tab=${tab}` : `/skills/${id}`),
  settings: (section: string) => `/settings/${section}`,
} as const;
