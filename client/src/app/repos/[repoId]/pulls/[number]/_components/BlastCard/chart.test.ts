import { describe, it, expect } from "vitest";
import { buildBlastChart } from "./chart";

const downstream = [
  {
    symbol: "formatDateLocal",
    callers: [
      { name: "fetchOrders", file: "src/api/orders.ts", line: 81 },
      { name: "fetchReports", file: "src/api/reports.ts", line: 25 },
    ],
    endpoints_affected: ["GET /api/v1/orders", "POST /api/v1/orders"],
    crons_affected: [],
  },
];

describe("buildBlastChart", () => {
  it("emits a flowchart with symbol → caller (solid) and symbol → endpoint (dotted) edges", () => {
    const chart = buildBlastChart(downstream);
    expect(chart.startsWith("flowchart LR")).toBe(true);
    expect(chart).toContain('s0["formatDateLocal"]:::sym');
    // solid edge to a caller node labelled file:line
    expect(chart).toContain('s0 --> s0c0["src/api/orders.ts:81"]:::caller');
    // dotted edge to an endpoint node
    expect(chart).toContain('s0 -.-> s0e0["GET /api/v1/orders"]:::ep');
  });

  it("returns an empty string when nothing has downstream callers", () => {
    expect(
      buildBlastChart([
        { symbol: "x", callers: [], endpoints_affected: ["GET /a"], crons_affected: [] },
      ]),
    ).toBe("");
  });

  it("sanitizes double quotes in labels so the diagram stays parseable", () => {
    const chart = buildBlastChart([
      {
        symbol: 'weird"name',
        callers: [{ name: "c", file: 'a"b.ts', line: 1 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ]);
    expect(chart).not.toContain('weird"name');
    expect(chart).toContain("weird name");
  });
});
