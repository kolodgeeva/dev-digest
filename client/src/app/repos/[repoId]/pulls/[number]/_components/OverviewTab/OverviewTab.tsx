"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastCard } from "../BlastCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
  /** owner/repo — forwarded to BlastCard for GitHub blob deep-links. */
  repoFullName?: string | null;
  /** PR head SHA — forwarded to BlastCard so links pin to the right revision. */
  headSha?: string | null;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {/* Two-column panel: Intent beside Blast Radius */}
      <div style={s.panelRow}>
        <div style={s.panelCol}>
          <IntentCard prId={prId} />
        </div>
        <div style={s.panelCol}>
          <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
