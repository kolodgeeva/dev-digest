/* Data + URL state for the Agent Editor route. The page itself is mostly layout
   JSX, so this hook just owns the queries, ?tab state, breadcrumb and the
   navigation handlers, keeping route strings out of the component. */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { routes } from "@/lib/routes";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

const VALID_TABS = ["config"];

export function useAgentEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`${routes.agent(id)}?${sp.toString()}`);
  };

  const crumb = [
    { label: "Skills Lab" },
    { label: "Agents", href: routes.agents() },
    { label: agent?.name ?? "Agent" },
  ];

  useDocumentTitle(agent?.name ?? null);

  return {
    id,
    agents,
    agent,
    isLoading,
    isError,
    error,
    refetch,
    update,
    tab,
    setTab,
    crumb,
    onSelectAgent: (aid: string) => router.push(routes.agent(aid, tab)),
    onCreate: () => router.push(routes.agents()),
    onRunOnPr: () => router.push(routes.home()),
  };
}
