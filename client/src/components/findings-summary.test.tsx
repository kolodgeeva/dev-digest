import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FindingsSummary } from "./findings-summary";

afterEach(cleanup);

describe("FindingsSummary", () => {
  it("renders one compact badge per NON-ZERO severity, skipping zeros", () => {
    const { container } = render(
      <FindingsSummary counts={{ CRITICAL: 3, WARNING: 0, SUGGESTION: 2 }} />,
    );
    const counts = [...container.querySelectorAll(".tnum")].map((n) => n.textContent);
    expect(counts).toEqual(["3", "2"]); // WARNING (0) is omitted
  });

  it("preserves CRITICAL → WARNING → SUGGESTION order", () => {
    const { container } = render(
      <FindingsSummary counts={{ CRITICAL: 1, WARNING: 4, SUGGESTION: 9 }} />,
    );
    const counts = [...container.querySelectorAll(".tnum")].map((n) => n.textContent);
    expect(counts).toEqual(["1", "4", "9"]);
  });

  it("renders nothing when every count is zero", () => {
    const { container } = render(
      <FindingsSummary counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
