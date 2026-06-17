import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("renders an em-dash — not $0.00 — when cost is missing", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("keeps 4 decimals for sub-cent costs so they don't collapse to $0.00", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("uses 3 decimals once the cost reaches a cent", () => {
    expect(formatCost(0.06)).toBe("$0.060");
    expect(formatCost(0.014)).toBe("$0.014");
  });

  it("renders a real $0.0000 only for a genuine zero cost", () => {
    expect(formatCost(0)).toBe("$0.0000");
  });
});
