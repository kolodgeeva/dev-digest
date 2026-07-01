import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { BlastCard } from "./BlastCard";

/* ── mock useBlast ────────────────────────────────────────────────────────── */

let blastReturn: { data: unknown; isLoading: boolean } = {
  data: null,
  isLoading: false,
};

vi.mock("../../../../../../../lib/hooks/blast", () => ({
  useBlast: () => blastReturn,
}));

// Stub the Mermaid renderer (it lazy-loads the real `mermaid` in the browser);
// expose the chart string so we can assert what the graph view feeds it.
vi.mock("../../../../../../../components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid">{chart}</div>
  ),
}));

afterEach(cleanup);

/* ── test fixtures ────────────────────────────────────────────────────────── */

const CALLER = {
  name: "UserProfile",
  file: "src/components/UserProfile.tsx",
  line: 42,
};

const BLAST_DATA = {
  changed_symbols: [{ name: "fetchUser", file: "src/api.ts", kind: "function" }],
  downstream: [
    {
      symbol: "fetchUser",
      callers: [CALLER],
      endpoints_affected: ["/api/users"],
      crons_affected: [],
    },
  ],
  summary: "1 symbol changed · 1 caller · 1 endpoint",
  degraded: false,
  reason: null,
};

/* ── render helper ────────────────────────────────────────────────────────── */

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ blast: blastMessages, brief: briefMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

/* ── tests ────────────────────────────────────────────────────────────────── */

describe("BlastCard", () => {
  beforeEach(() => {
    blastReturn = { data: BLAST_DATA, isLoading: false };
  });

  it("shows empty state when useBlast returns null — 404→null path", () => {
    blastReturn = { data: null, isLoading: false };
    renderWithIntl(<BlastCard prId="pr1" />);
    // EmptyState is rendered; no tree links present
    expect(screen.getByText("No blast radius data")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the 'nothing to map' empty state when the index served but no symbols changed", () => {
    // Index is fine (degraded: false) but the PR changed no indexed code.
    blastReturn = {
      data: { changed_symbols: [], downstream: [], summary: "", degraded: false, reason: null },
      isLoading: false,
    };
    renderWithIntl(<BlastCard prId="pr1" />);
    expect(screen.getByText("Nothing to map")).toBeInTheDocument();
    // The misleading "index may not be built" copy must NOT appear here.
    expect(screen.queryByText("No blast radius data")).not.toBeInTheDocument();
  });

  it("renders the tree with the correct section label", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    // Section label uses brief.block.blast
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });

  it("renders a caller link with the correct githubBlobUrl href", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );

    const expectedHref = githubBlobUrl(
      "owner/repo",
      "abc123",
      CALLER.file,
      CALLER.line,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expectedHref);
    expect(link).toHaveTextContent(`${CALLER.file}:${CALLER.line}`);
  });

  it("renders caller as non-link MonoLink when repoFullName/headSha are absent", () => {
    // Without repoFullName / headSha, MonoLink renders a <button>, not an <a>
    renderWithIntl(<BlastCard prId="pr1" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(`${CALLER.file}:${CALLER.line}`),
    ).toBeInTheDocument();
  });

  it("renders endpoint chips under the symbol", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    expect(screen.getByText("/api/users")).toBeInTheDocument();
  });

  it("collapses a symbol's callers when its header is clicked", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    // Expanded by default — caller is visible.
    expect(screen.getByText(`${CALLER.file}:${CALLER.line}`)).toBeInTheDocument();
    // Click the symbol header (its monospace name) to collapse it.
    fireEvent.click(screen.getByText("fetchUser"));
    expect(
      screen.queryByText(`${CALLER.file}:${CALLER.line}`),
    ).not.toBeInTheDocument();
  });

  it("renders the noDownstream message when no callers exist", () => {
    blastReturn = {
      data: {
        ...BLAST_DATA,
        downstream: [
          { symbol: "fetchUser", callers: [], endpoints_affected: [], crons_affected: [] },
        ],
      },
      isLoading: false,
    };
    renderWithIntl(<BlastCard prId="pr1" />);
    // t("noDownstream", { count: 1 }) → "1 changed symbol(s), no downstream callers found."
    expect(screen.getByText(/no downstream callers found/i)).toBeInTheDocument();
  });

  it("renders degraded badge and hint when degraded is true", () => {
    blastReturn = {
      data: { ...BLAST_DATA, degraded: true, reason: "Index is partial" },
      isLoading: false,
    };
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    // t("degraded") → "Partial index"
    expect(screen.getByText("Partial index")).toBeInTheDocument();
    // t("degradedHint")
    expect(
      screen.getByText(/showing best-effort results/i),
    ).toBeInTheDocument();
  });

  it("renders the graph (Mermaid) when graph view is selected and callers exist", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    fireEvent.click(screen.getByText("graph"));
    const chart = screen.getByTestId("mermaid").textContent ?? "";
    expect(chart).toContain("flowchart LR");
    expect(chart).toContain("fetchUser"); // changed symbol node
    expect(chart).toContain(`${CALLER.file}:${CALLER.line}`); // caller node
  });

  it("shows the graph placeholder when there are no downstream callers", () => {
    blastReturn = {
      data: {
        ...BLAST_DATA,
        downstream: [
          { symbol: "fetchUser", callers: [], endpoints_affected: [], crons_affected: [] },
        ],
      },
      isLoading: false,
    };
    renderWithIntl(<BlastCard prId="pr1" />);
    fireEvent.click(screen.getByText("graph"));
    expect(screen.getByText(/no downstream callers to graph/i)).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid")).not.toBeInTheDocument();
  });

  it("renders summary count chips", () => {
    renderWithIntl(
      <BlastCard prId="pr1" repoFullName="owner/repo" headSha="abc123" />,
    );
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints")).toBeInTheDocument();
  });
});
