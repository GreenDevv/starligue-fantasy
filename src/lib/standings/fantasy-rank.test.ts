import { describe, it, expect } from "vitest";
import { rankTeams, rankDelta } from "./fantasy-rank";

const t = (teamId: string, leagueId: string, cumulativePoints: number) => ({ teamId, leagueId, cumulativePoints });

describe("rankTeams", () => {
  it("returns an empty array for no teams", () => {
    expect(rankTeams([])).toEqual([]);
  });

  it("ranks by cumulative points, highest first", () => {
    const ranked = rankTeams([t("a", "L1", 40), t("b", "L1", 70), t("c", "L1", 55)]);
    expect(ranked.find((r) => r.teamId === "b")!.globalRank).toBe(1);
    expect(ranked.find((r) => r.teamId === "c")!.globalRank).toBe(2);
    expect(ranked.find((r) => r.teamId === "a")!.globalRank).toBe(3);
  });

  it("shares the rank on ties and skips the next (competition ranking)", () => {
    const ranked = rankTeams([t("a", "L1", 50), t("b", "L1", 50), t("c", "L1", 30)]);
    expect(ranked.find((r) => r.teamId === "a")!.globalRank).toBe(1);
    expect(ranked.find((r) => r.teamId === "b")!.globalRank).toBe(1);
    expect(ranked.find((r) => r.teamId === "c")!.globalRank).toBe(3);
  });

  it("computes leagueRank independently per league", () => {
    const ranked = rankTeams([
      t("a", "L1", 90), // global 1, L1 1
      t("b", "L2", 80), // global 2, L2 1
      t("c", "L1", 70), // global 3, L1 2
      t("d", "L2", 60), // global 4, L2 2
    ]);
    const by = Object.fromEntries(ranked.map((r) => [r.teamId, r]));
    expect(by.a).toMatchObject({ globalRank: 1, leagueRank: 1 });
    expect(by.b).toMatchObject({ globalRank: 2, leagueRank: 1 });
    expect(by.c).toMatchObject({ globalRank: 3, leagueRank: 2 });
    expect(by.d).toMatchObject({ globalRank: 4, leagueRank: 2 });
  });

  it("keeps the input fields untouched", () => {
    const [row] = rankTeams([t("a", "L1", 12.5)]);
    expect(row).toMatchObject({ teamId: "a", leagueId: "L1", cumulativePoints: 12.5, globalRank: 1, leagueRank: 1 });
  });
});

describe("rankDelta", () => {
  it("returns null when there is no previous rank", () => {
    expect(rankDelta(null, 5)).toBeNull();
  });

  it("is positive when places are gained (rank improves)", () => {
    expect(rankDelta(22, 14)).toBe(8);
  });

  it("is negative when places are lost", () => {
    expect(rankDelta(3, 7)).toBe(-4);
  });

  it("is zero when the rank is unchanged", () => {
    expect(rankDelta(10, 10)).toBe(0);
  });
});
