import { describe, it, expect } from "vitest";
import { tallyGoalsBySequence, frenchOrdinal } from "./goal-tally";

describe("tallyGoalsBySequence", () => {
  it("numérote les buts d'un joueur dans l'ordre chronologique", () => {
    const result = tallyGoalsBySequence([
      { sequence: 0, playerId: "p1" },
      { sequence: 3, playerId: "p1" },
      { sequence: 7, playerId: "p1" },
    ]);
    expect(result.get(0)).toBe(1);
    expect(result.get(3)).toBe(2);
    expect(result.get(7)).toBe(3);
  });

  it("compte séparément par joueur", () => {
    const result = tallyGoalsBySequence([
      { sequence: 0, playerId: "p1" },
      { sequence: 1, playerId: "p2" },
      { sequence: 2, playerId: "p1" },
    ]);
    expect(result.get(0)).toBe(1);
    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(2);
  });

  it("ignore les événements sans joueur résolu", () => {
    const result = tallyGoalsBySequence([
      { sequence: 0, playerId: null },
      { sequence: 1, playerId: "p1" },
    ]);
    expect(result.has(0)).toBe(false);
    expect(result.get(1)).toBe(1);
  });

  it("ne dépend pas de l'ordre d'entrée (retrie par sequence)", () => {
    const result = tallyGoalsBySequence([
      { sequence: 5, playerId: "p1" },
      { sequence: 1, playerId: "p1" },
    ]);
    expect(result.get(1)).toBe(1);
    expect(result.get(5)).toBe(2);
  });
});

describe("frenchOrdinal", () => {
  it("utilise '1er' pour 1", () => {
    expect(frenchOrdinal(1)).toBe("1er");
  });

  it("utilise 'Ne' pour le reste", () => {
    expect(frenchOrdinal(2)).toBe("2e");
    expect(frenchOrdinal(11)).toBe("11e");
  });
});
