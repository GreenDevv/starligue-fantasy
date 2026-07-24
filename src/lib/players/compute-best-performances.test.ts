import { describe, it, expect } from "vitest";
import { rankTopPerformances } from "./compute-best-performances";

describe("rankTopPerformances", () => {
  it("sorts by points descending", () => {
    const totals = new Map([
      ["p1", 5],
      ["p2", 12],
      ["p3", 8],
    ]);
    const result = rankTopPerformances(totals, new Map(), 10);
    expect(result.map((r) => r.playerId)).toEqual(["p2", "p3", "p1"]);
  });

  it("truncates to the requested limit", () => {
    const totals = new Map([
      ["p1", 5],
      ["p2", 12],
      ["p3", 8],
    ]);
    const result = rankTopPerformances(totals, new Map(), 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.playerId)).toEqual(["p2", "p3"]);
  });

  it("breaks ties deterministically by playerId", () => {
    const totals = new Map([
      ["zeta", 10],
      ["alpha", 10],
    ]);
    const result = rankTopPerformances(totals, new Map(), 10);
    expect(result.map((r) => r.playerId)).toEqual(["alpha", "zeta"]);
  });

  it("attaches lnhRating when available, null otherwise", () => {
    const totals = new Map([["p1", 5]]);
    const ratings = new Map([["p1", 7.5]]);
    const result = rankTopPerformances(totals, ratings, 10);
    expect(result[0]!.lnhRating).toBe(7.5);

    const noRatingResult = rankTopPerformances(totals, new Map(), 10);
    expect(noRatingResult[0]!.lnhRating).toBeNull();
  });
});
