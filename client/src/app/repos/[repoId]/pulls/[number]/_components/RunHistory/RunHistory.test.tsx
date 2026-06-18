/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: 0.0013,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "title">): FindingRecord {
  return {
    category: "style",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because",
    confidence: 0.9,
    review_id: "rev-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

describe("RunHistory — timeline severity badges click-to-filter", () => {
  function renderWithFindings(findings: FindingRecord[]) {
    const findingsByRun = new Map([["run-1", findings]]);
    return render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: findings.length, blockers: 0, score: 70 })]}
          findingsByRun={findingsByRun}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
  }

  // Severity badges are the only buttons carrying aria-pressed (the row also has
  // the agent-name + trace buttons). In CRITICAL→WARNING→SUGGESTION order.
  const severityBadges = () =>
    screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));

  it("renders the severity badges as interactive buttons (timeline is clickable)", () => {
    renderWithFindings([
      finding({ id: "f1", severity: "CRITICAL", title: "Crit one" }),
      finding({ id: "f2", severity: "WARNING", title: "Warn one" }),
    ]);
    expect(severityBadges()).toHaveLength(2);
  });

  it("clicking a severity badge filters that run's popover to that severity", () => {
    vi.useFakeTimers();
    renderWithFindings([
      finding({ id: "f1", severity: "CRITICAL", title: "Crit one" }),
      finding({ id: "f2", severity: "WARNING", title: "Warn one" }),
    ]);

    // Open the hover popover. mouseenter doesn't bubble, so target the HoverCard
    // wrapper span: badge → FindingsSummary span → HoverCard trigger span.
    const crit = severityBadges()[0]!;
    const hoverSpan = crit.parentElement!.parentElement!;
    fireEvent.mouseEnter(hoverSpan);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.getByText("Warn one")).toBeInTheDocument();

    // Click CRITICAL → only the critical finding remains.
    fireEvent.click(crit);
    expect(screen.getByText("Crit one")).toBeInTheDocument();
    expect(screen.queryByText("Warn one")).not.toBeInTheDocument();
  });
});
