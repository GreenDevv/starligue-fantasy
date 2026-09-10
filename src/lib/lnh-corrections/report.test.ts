import { describe, it, expect } from "vitest";
import { buildImpactRows, type TeamMeta, type TeamPointState, type AppliedCorrectionSummary } from "./report";

function meta(id: string, over: Partial<TeamMeta> = {}): TeamMeta {
  return { teamId: id, userId: `u-${id}`, email: `${id}@x.fr`, teamName: `Team ${id}`, leagueName: "L", ...over };
}
function state(points: number, globalRank: number | null = null, leagueRank: number | null = null): TeamPointState {
  return { points, globalRank, leagueRank };
}
const applied: AppliedCorrectionSummary = {
  playerId: "p1",
  playerName: "GNAGO Adam",
  club: "CAEN",
  ratingBefore: 19.1,
  ratingAfter: 19.4,
  ratingChanged: true,
  otherFieldCount: 2,
};

describe("buildImpactRows", () => {
  it("ignore les équipes dont les points ne bougent pas (bruit d'arrondi)", () => {
    const rows = buildImpactRows({
      teams: [meta("a"), meta("b")],
      before: new Map([["a", state(50)], ["b", state(30)]]),
      after: new Map([["a", state(50.02)], ["b", state(34)]]),
      appliedByPlayerId: new Map([["p1", applied]]),
      fieldedPlayerIdsByTeam: new Map([["a", new Set(["p1"])], ["b", new Set(["p2"])]]),
    });
    expect(rows.map((r) => r.teamId)).toEqual(["b"]);
  });

  it("distingue impact direct (joueur aligné corrigé) et indirect", () => {
    const rows = buildImpactRows({
      teams: [meta("a"), meta("b")],
      before: new Map([["a", state(50, 2)], ["b", state(30, 5)]]),
      after: new Map([["a", state(53, 1)], ["b", state(28, 6)]]),
      appliedByPlayerId: new Map([["p1", applied]]),
      fieldedPlayerIdsByTeam: new Map([["a", new Set(["p1", "px"])], ["b", new Set(["py"])]]),
    });
    const a = rows.find((r) => r.teamId === "a")!;
    const b = rows.find((r) => r.teamId === "b")!;
    expect(a.indirect).toBe(false);
    expect(a.directCorrections).toHaveLength(1);
    expect(a.delta).toBe(3);
    expect(a.globalRankBefore).toBe(2);
    expect(a.globalRankAfter).toBe(1);
    expect(b.indirect).toBe(true);
    expect(b.directCorrections).toHaveLength(0);
    expect(b.delta).toBe(-2);
  });

  it("trie par ampleur d'écart décroissante", () => {
    const rows = buildImpactRows({
      teams: [meta("a"), meta("b"), meta("c")],
      before: new Map([["a", state(10)], ["b", state(10)], ["c", state(10)]]),
      after: new Map([["a", state(11)], ["b", state(16)], ["c", state(8)]]),
      appliedByPlayerId: new Map(),
      fieldedPlayerIdsByTeam: new Map(),
    });
    expect(rows.map((r) => r.teamId)).toEqual(["b", "c", "a"]);
  });
});
