import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 42,
    title: "Add findings column",
    author: "octocat",
    branch: "feat/x",
    base: "main",
    head_sha: "abc1234",
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: "reviewed",
    opened_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-11T00:00:00.000Z",
    score: 80,
    cost_usd: 0.0013,
    findings_summary: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — findings column", () => {
  it("renders the per-severity badges when findings_summary is present", () => {
    // score:null keeps the (also .tnum) score ring out of the query so we read
    // only the findings badges.
    const { container } = renderRow(
      pr({ score: null, findings_summary: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }),
    );
    const counts = [...container.querySelectorAll(".tnum")].map((n) => n.textContent);
    expect(counts).toEqual(["2", "1"]); // SUGGESTION (0) skipped
  });

  it("renders an em dash when findings_summary is null", () => {
    renderRow(pr({ findings_summary: null }));
    // The score cell shows 80; the findings cell shows the muted em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
