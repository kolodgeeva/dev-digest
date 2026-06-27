import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PrFindingsHover } from "./PrFindingsHover";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Stub the lazy reviews fetch with a fixed latest review.
const reviews = [
  {
    findings: [
      { id: "f1", severity: "CRITICAL", title: "Crit A" },
      { id: "f2", severity: "WARNING", title: "Warn A" },
      { id: "f3", severity: "CRITICAL", title: "Crit B" },
      { id: "f4", severity: "SUGGESTION", title: "Sugg A" },
    ],
  },
];
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviews, isLoading: false }),
}));

// Render only what FindingsPopover received (titles) so we assert the filter.
vi.mock("@/components/FindingsPopover", () => ({
  FindingsPopover: ({ findings }: { findings: { id: string; title: string }[] }) => (
    <ul>
      {findings.map((f) => (
        <li key={f.id}>{f.title}</li>
      ))}
    </ul>
  ),
}));

afterEach(cleanup);

describe("PrFindingsHover — click-to-filter", () => {
  it("shows all findings when no severity is active", () => {
    render(<PrFindingsHover prId="pr-1" repoId="r1" prNumber={1} activeSeverity={null} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows only the active severity's findings", () => {
    render(<PrFindingsHover prId="pr-1" repoId="r1" prNumber={1} activeSeverity="CRITICAL" />);
    const items = screen.getAllByRole("listitem").map((n) => n.textContent);
    expect(items).toEqual(["Crit A", "Crit B"]);
  });
});
