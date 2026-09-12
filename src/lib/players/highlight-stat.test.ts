import { describe, it, expect } from "vitest";
import { pickHighlightStats } from "./highlight-stat";

describe("pickHighlightStats", () => {
  it("gardien : arrêts uniquement", () => {
    const stats = pickHighlightStats({ position: "GK", goalsTotal: null, assists: null, saves: 8 });
    expect(stats).toEqual([{ key: "saves", value: 8 }]);
  });

  it("gardien sans arrêt : rien à afficher", () => {
    expect(pickHighlightStats({ position: "GK", goalsTotal: null, assists: null, saves: 0 })).toEqual([]);
    expect(pickHighlightStats({ position: "GK", goalsTotal: null, assists: null, saves: null })).toEqual([]);
  });

  it("joueur de champ : buts puis passes, dans cet ordre", () => {
    const stats = pickHighlightStats({ position: "RW", goalsTotal: 4, assists: 2, saves: null });
    expect(stats).toEqual([
      { key: "goals", value: 4 },
      { key: "assists", value: 2 },
    ]);
  });

  it("joueur de champ sans but ni passe : rien à afficher", () => {
    expect(pickHighlightStats({ position: "PV", goalsTotal: 0, assists: 0, saves: null })).toEqual([]);
  });

  it("joueur de champ avec seulement des passes", () => {
    const stats = pickHighlightStats({ position: "CB", goalsTotal: 0, assists: 3, saves: null });
    expect(stats).toEqual([{ key: "assists", value: 3 }]);
  });
});
