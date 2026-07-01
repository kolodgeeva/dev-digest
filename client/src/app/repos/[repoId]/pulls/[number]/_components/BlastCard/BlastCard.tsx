/* BlastCard — shows the PR's blast radius: which symbols changed, who
   calls them downstream (clickable file:line GitHub links), and which
   HTTP endpoints / crons are reachable from those call sites.
   Data comes from GET /pulls/:id/blast (zero LLM calls; pure repo-intel
   index reads). Renders beside IntentCard in the Overview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, Chip, Badge, SectionLabel, EmptyState, MonoLink } from "@devdigest/ui";
import {
  Code,
  CornerDownRight,
  Globe,
  Clock,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { useBlast } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { buildBlastChart } from "./chart";
import { s } from "./styles";

interface BlastCardProps {
  prId: string | null | undefined;
  /** owner/repo — used to build github.com blob deep-links for callers. */
  repoFullName?: string | null;
  /** PR head SHA — pins the link to the correct revision. */
  headSha?: string | null;
}

/** Method → token color, so endpoint pills read like the rest of the app. */
function methodStyle(endpoint: string): { color: string; bg: string } {
  const method = endpoint.trim().split(/\s+/)[0]?.toUpperCase();
  switch (method) {
    case "GET":
      return { color: "var(--info)", bg: "var(--info-bg)" };
    case "POST":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "PUT":
    case "PATCH":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    case "DELETE":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    default:
      return { color: "var(--text-secondary)", bg: "var(--bg-hover)" };
  }
}

function Stat({
  icon: I,
  count,
  label,
}: {
  icon: typeof Code;
  count: number;
  label: string;
}) {
  return (
    <span style={s.stat}>
      <I size={13} style={{ color: "var(--text-muted)" }} />
      <span style={s.statCount}>{count}</span>
      <span style={s.statLabel}>{label}</span>
    </span>
  );
}

export function BlastCard({ prId, repoFullName, headSha }: BlastCardProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const [view, setView] = React.useState<"tree" | "graph">("tree");
  // Symbols collapsed by the user (all start expanded so callers are visible).
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const { data, isLoading } = useBlast(prId);

  const symbolCount = data?.changed_symbols.length ?? 0;
  const callerCount =
    data?.downstream.reduce((sum, d) => sum + d.callers.length, 0) ?? 0;
  const endpointCount = data
    ? new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size
    : 0;
  const cronCount = data
    ? new Set(data.downstream.flatMap((d) => d.crons_affected)).size
    : 0;

  const hasCallers = callerCount > 0;
  const isEmpty = !data || data.changed_symbols.length === 0;
  // Distinguish the two empty causes so the copy is accurate:
  //  - noIndex: no data, or the index was incomplete (degraded) → "index may not be built".
  //  - otherwise: the index served fine but none of the PR's changed files contain
  //    indexed symbols (e.g. it only touches non-.ts files) → "nothing to map".
  const noIndex = !data || data.degraded;

  const toggle = (symbol: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <section>
      <SectionLabel
        icon="Zap"
        right={
          <div style={s.toggle}>
            <Chip active={view === "tree"} onClick={() => setView("tree")}>
              {t("view.tree")}
            </Chip>
            <Chip active={view === "graph"} onClick={() => setView("graph")}>
              {t("view.graph")}
            </Chip>
          </div>
        }
      >
        {tBrief("block.blast")}
      </SectionLabel>

      <div style={s.card}>
        {isLoading ? (
          <div style={s.skeletonGroup}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="70%" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon="GitBranch"
            title={noIndex ? t("empty.title") : t("empty.noSymbolsTitle")}
            body={noIndex ? t("empty.body") : t("empty.noSymbolsBody")}
          />
        ) : (
          <>
            {data.degraded && (
              <div style={s.degradedRow}>
                <Badge dot color="var(--warn)">
                  {t("degraded")}
                </Badge>
                <p style={s.degradedHint}>{t("degradedHint")}</p>
              </div>
            )}

            {/* Summary stat row — icon + count + label, like the design. */}
            <div style={s.statRow}>
              <Stat icon={Code} count={symbolCount} label={t("stat.symbols")} />
              <Stat icon={CornerDownRight} count={callerCount} label={t("stat.callers")} />
              <Stat icon={Globe} count={endpointCount} label={t("stat.endpoints")} />
              <Stat icon={Clock} count={cronCount} label={t("stat.crons")} />
            </div>

            {view === "tree" ? (
              hasCallers ? (
                <div style={s.tree}>
                  {data.downstream
                    .filter((entry) => entry.callers.length > 0)
                    .map((entry, i) => {
                      const open = !collapsed.has(entry.symbol);
                      const Chevron = open ? ChevronDown : ChevronRight;
                      return (
                        <div key={`${entry.symbol}-${i}`} style={s.symbolBlock}>
                          <button
                            type="button"
                            style={s.symbolHeader}
                            onClick={() => toggle(entry.symbol)}
                            aria-expanded={open}
                          >
                            <Chevron size={14} style={{ color: "var(--text-muted)" }} />
                            <Code size={13} style={{ color: "var(--text-muted)" }} />
                            <span style={s.symbolName}>{entry.symbol}</span>
                            <span style={s.symbolCount}>
                              {t("callerCount", { count: entry.callers.length })}
                            </span>
                          </button>

                          {open && (
                            <div style={s.symbolBody}>
                              <div style={s.callerList}>
                                {entry.callers.map((c, ci) => {
                                  const last = ci === entry.callers.length - 1;
                                  return (
                                    <div key={`${c.file}-${c.line}-${ci}`} style={s.callerRow}>
                                      <span style={s.connector}>{last ? "└─" : "├─"}</span>
                                      <MonoLink
                                        href={
                                          repoFullName && headSha
                                            ? githubBlobUrl(repoFullName, headSha, c.file, c.line)
                                            : undefined
                                        }
                                      >
                                        {c.file}:{c.line}
                                      </MonoLink>
                                    </div>
                                  );
                                })}
                              </div>

                              {(entry.endpoints_affected.length > 0 ||
                                entry.crons_affected.length > 0) && (
                                <div style={s.pills}>
                                  {entry.endpoints_affected.map((ep) => {
                                    const ms = methodStyle(ep);
                                    return (
                                      <Badge key={ep} icon="Globe" color={ms.color} bg={ms.bg} mono>
                                        {ep}
                                      </Badge>
                                    );
                                  })}
                                  {entry.crons_affected.map((cron) => (
                                    <Badge
                                      key={cron}
                                      icon="Clock"
                                      color="var(--warn)"
                                      bg="var(--warn-bg)"
                                      mono
                                    >
                                      {cron}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p style={s.noDownstream}>
                  {t("noDownstream", { count: data.changed_symbols.length })}
                </p>
              )
            ) : hasCallers ? (
              <MermaidDiagram chart={buildBlastChart(data.downstream)} />
            ) : (
              <p style={s.graphPlaceholder}>{t("graph.empty")}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
