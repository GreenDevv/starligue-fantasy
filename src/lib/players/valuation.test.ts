import { describe, it, expect } from "vitest";
import { computeValuationsFromLnhScores, type PlayerLnhScoreInput } from "./valuation";

function p(overrides: Partial<PlayerLnhScoreInput> = {}): PlayerLnhScoreInput {
  return { playerId: "p1", position: "CB", avgLnhScore: 5, ...overrides };
}

describe("computeValuationsFromLnhScores", () => {
  it("gives the min-value player the config floor and the max-value player the ceiling", () => {
    const players = [
      p({ playerId: "worst", avgLnhScore: 0 }),
      p({ playerId: "best", avgLnhScore: 10 }),
    ];
    const result = computeValuationsFromLnhScores(players);
    const worst = result.find((r) => r.playerId === "worst")!;
    const best = result.find((r) => r.playerId === "best")!;
    expect(worst.marketValue).toBe(4.0);
    expect(best.marketValue).toBe(20.0);
  });

  it("places a mid-pack player roughly between floor and ceiling", () => {
    const players = [
      p({ playerId: "low", avgLnhScore: 0 }),
      p({ playerId: "mid", avgLnhScore: 5 }),
      p({ playerId: "high", avgLnhScore: 10 }),
    ];
    const result = computeValuationsFromLnhScores(players);
    const mid = result.find((r) => r.playerId === "mid")!;
    expect(mid.marketValue).toBe(12.0); // exactement au milieu de [4, 20]
  });

  it("normalizes independently per position (a weak CB and a weak PV don't get the same value just because their raw scores differ in scale)", () => {
    const players = [
      p({ playerId: "cb-low", position: "CB", avgLnhScore: 5 }),
      p({ playerId: "cb-high", position: "CB", avgLnhScore: 15 }),
      p({ playerId: "pv-low", position: "PV", avgLnhScore: 0 }),
      p({ playerId: "pv-high", position: "PV", avgLnhScore: 2 }),
    ];
    const result = computeValuationsFromLnhScores(players);
    const cbLow = result.find((r) => r.playerId === "cb-low")!;
    const pvLow = result.find((r) => r.playerId === "pv-low")!;
    // Les deux sont le pire de leur poste → même valeur plancher, malgré des scores bruts très différents (5 vs 0)
    expect(cbLow.marketValue).toBe(4.0);
    expect(pvLow.marketValue).toBe(4.0);
  });

  it("gives the single player at a position the midpoint value (no comparison possible)", () => {
    const players = [p({ playerId: "solo", position: "GK", avgLnhScore: 999 })];
    const result = computeValuationsFromLnhScores(players);
    expect(result).toEqual([{ playerId: "solo", marketValue: 12.0 }]);
  });

  it("gives every player the midpoint when all scores at a position are tied", () => {
    const players = [
      p({ playerId: "a", avgLnhScore: 7 }),
      p({ playerId: "b", avgLnhScore: 7 }),
    ];
    const result = computeValuationsFromLnhScores(players);
    expect(result.every((r) => r.marketValue === 12.0)).toBe(true);
  });

  it("rounds to the nearest 0.5", () => {
    const players = [
      p({ playerId: "a", avgLnhScore: 0 }),
      p({ playerId: "b", avgLnhScore: 3 }), // normalized = 0.3 -> 4 + 0.3*16 = 8.8 -> rounds to 9.0
      p({ playerId: "c", avgLnhScore: 10 }),
    ];
    const result = computeValuationsFromLnhScores(players);
    const b = result.find((r) => r.playerId === "b")!;
    expect(b.marketValue).toBe(9.0);
  });

  it("respects a custom config range", () => {
    const players = [
      p({ playerId: "low", avgLnhScore: 0 }),
      p({ playerId: "high", avgLnhScore: 10 }),
    ];
    const result = computeValuationsFromLnhScores(players, { minValue: 10, maxValue: 12 });
    expect(result.find((r) => r.playerId === "low")!.marketValue).toBe(10);
    expect(result.find((r) => r.playerId === "high")!.marketValue).toBe(12);
  });

  it("handles an empty list", () => {
    expect(computeValuationsFromLnhScores([])).toEqual([]);
  });
});
