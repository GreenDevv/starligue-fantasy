import { describe, it, expect } from "vitest";
import { mergeLiveGoals } from "./live-goal-leaders";

describe("mergeLiveGoals", () => {
  it("renvoie le classement tel quel s'il n'y a aucun but en direct", () => {
    const ranked = [{ playerId: "p1", value: 10 }];
    expect(mergeLiveGoals(ranked, new Map())).toBe(ranked);
  });

  it("ajoute les buts en direct à un joueur déjà classé", () => {
    const ranked = [
      { playerId: "p1", value: 10 },
      { playerId: "p2", value: 8 },
    ];
    const result = mergeLiveGoals(ranked, new Map([["p2", 3]]));
    expect(result).toEqual(expect.arrayContaining([{ playerId: "p1", value: 10 }, { playerId: "p2", value: 11 }]));
  });

  it("crée une nouvelle entrée pour un buteur en direct absent du classement", () => {
    const ranked = [{ playerId: "p1", value: 10 }];
    const result = mergeLiveGoals(ranked, new Map([["p2", 2]]));
    expect(result).toEqual(expect.arrayContaining([{ playerId: "p1", value: 10 }, { playerId: "p2", value: 2 }]));
    expect(result).toHaveLength(2);
  });

  it("ne mute pas le classement d'origine", () => {
    const ranked = [{ playerId: "p1", value: 10 }];
    mergeLiveGoals(ranked, new Map([["p1", 5]]));
    expect(ranked).toEqual([{ playerId: "p1", value: 10 }]);
  });
});
