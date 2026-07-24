import { describe, it, expect } from "vitest";
import { pickBestXI, type SeasonPlayerPoints } from "./best-xi";

describe("pickBestXI", () => {
  it("garde le joueur au plus haut total par poste", () => {
    const entries: SeasonPlayerPoints[] = [
      { playerId: "gk-1", position: "GK", points: 12 },
      { playerId: "gk-2", position: "GK", points: 20 },
      { playerId: "cb-1", position: "CB", points: 8 },
    ];
    const result = pickBestXI(entries);
    expect(result.get("GK")).toBe("gk-2");
    expect(result.get("CB")).toBe("cb-1");
  });

  it("poste sans aucun joueur noté → absent du résultat", () => {
    const entries: SeasonPlayerPoints[] = [{ playerId: "gk-1", position: "GK", points: 5 }];
    const result = pickBestXI(entries);
    expect(result.has("GK")).toBe(true);
    expect(result.has("PV")).toBe(false);
    expect(result.size).toBe(1);
  });

  it("égalité de points → tie-break déterministe sur playerId (ordre alphabétique)", () => {
    const entries: SeasonPlayerPoints[] = [
      { playerId: "zeta", position: "LW", points: 15 },
      { playerId: "alpha", position: "LW", points: 15 },
    ];
    const result = pickBestXI(entries);
    expect(result.get("LW")).toBe("alpha");
  });

  it("liste vide → résultat vide", () => {
    expect(pickBestXI([]).size).toBe(0);
  });

  it("7 postes distincts, chacun un seul joueur → résultat complet", () => {
    const positions = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"] as const;
    const entries: SeasonPlayerPoints[] = positions.map((position, i) => ({
      playerId: `p-${i}`,
      position,
      points: i,
    }));
    const result = pickBestXI(entries);
    expect(result.size).toBe(7);
    for (const position of positions) {
      expect(result.has(position)).toBe(true);
    }
  });
});
