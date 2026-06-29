import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

// jsdom has no scrollIntoView — spy so the badge's scroll path doesn't throw.
const scrollSpy = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollSpy;
});

const WEBHOOKS_PATCH = [
  "@@ -1,1 +1,3 @@",
  " export function webhookHandler() {",
  "+  const target = req.body.callback_url;",
  "+  await fetch(target);",
].join("\n");

const files: PrFile[] = [
  { path: "src/api/public/webhooks.ts", additions: 2, deletions: 0, patch: WEBHOOKS_PATCH },
  { path: "package-lock.json", additions: 92, deletions: 24, patch: "@@ -1,1 +1,1 @@\n+lock" },
];

const groups: SmartDiffGroup[] = [
  {
    role: "core",
    files: [
      {
        path: "src/api/public/webhooks.ts",
        pseudocode_summary: null,
        additions: 2,
        deletions: 0,
        finding_lines: [2, 3],
      },
    ],
  },
  {
    role: "boilerplate",
    files: [
      {
        path: "package-lock.json",
        pseudocode_summary: null,
        additions: 92,
        deletions: 24,
        finding_lines: [],
      },
    ],
  },
];

const splitSuggestion = { too_big: false, total_lines: 2, proposed_splits: [] };

function renderViewer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <SmartDiffViewer groups={groups} files={files} splitSuggestion={splitSuggestion} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders the Core group before Boilerplate", () => {
    renderViewer();
    const titles = screen.getAllByText(/Core logic|Boilerplate/).map((el) => el.textContent);
    expect(titles).toEqual(["Core logic", "Boilerplate"]);
  });

  it("collapses the Boilerplate group by default (lock-file hidden)", () => {
    renderViewer();
    // Core file is shown; the lock-file lives in the collapsed boilerplate group.
    expect(screen.getByText("src/api/public/webhooks.ts")).toBeInTheDocument();
    expect(screen.queryByText("package-lock.json")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
  });

  it("shows a clickable 'N findings' badge that scrolls to the flagged line", async () => {
    renderViewer();
    const badge = screen.getByRole("button", { name: /2 findings/ });
    expect(badge).toBeInTheDocument();

    fireEvent.click(badge);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  });

  it("does not render a split banner when the PR is not too big", () => {
    renderViewer();
    expect(screen.queryByText(/consider splitting/)).not.toBeInTheDocument();
  });
});
