import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

  it("renders no buttons when onSelect is omitted (timeline path unchanged)", () => {
    const { container } = render(
      <FindingsSummary counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("calls onSelect with the clicked severity when interactive", () => {
    const onSelect = vi.fn();
    render(
      <FindingsSummary
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        onSelect={onSelect}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2); // SUGGESTION (0) is skipped
    fireEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("dims non-active badges and marks the active one pressed", () => {
    render(
      <FindingsSummary
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        onSelect={() => {}}
        activeSeverity="CRITICAL"
      />,
    );
    const [crit, warn] = screen.getAllByRole("button");
    expect(crit!.getAttribute("aria-pressed")).toBe("true");
    expect(crit!.style.opacity).toBe("1");
    expect(warn!.style.opacity).toBe("0.4");
  });
});
