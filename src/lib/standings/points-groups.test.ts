import { describe, it, expect } from "vitest";
import { computePointsGroupIndices, hasPendingMatchThisRound } from "./points-groups";

describe("computePointsGroupIndices", () => {
  it("attribue le même index à des lignes consécutives à points égaux", () => {
    const indices = computePointsGroupIndices([{ points: 10 }, { points: 10 }, { points: 8 }]);
    expect(indices).toEqual([0, 0, 1]);
  });

  it("incrémente à chaque changement de points, même par le même total plus tard", () => {
    // Ne devrait pas arriver dans un classement trié, mais la fonction ne suppose
    // pas l'ordre : deux groupes à 10 points non adjacents restent deux groupes.
    const indices = computePointsGroupIndices([{ points: 10 }, { points: 8 }, { points: 10 }]);
    expect(indices).toEqual([0, 1, 2]);
  });

  it("un seul groupe si tout le monde a le même total", () => {
    const indices = computePointsGroupIndices([{ points: 0 }, { points: 0 }, { points: 0 }]);
    expect(indices).toEqual([0, 0, 0]);
  });

  it("liste vide → liste vide", () => {
    expect(computePointsGroupIndices([])).toEqual([]);
  });
});

describe("hasPendingMatchThisRound", () => {
  it("false si aucune journée de référence (aucun snapshot encore)", () => {
    expect(hasPendingMatchThisRound(0, null)).toBe(false);
  });

  it("true si le club a joué un match de moins que le numéro de la journée en cours", () => {
    expect(hasPendingMatchThisRound(4, 5)).toBe(true);
  });

  it("false si le club a déjà joué la journée en cours", () => {
    expect(hasPendingMatchThisRound(5, 5)).toBe(false);
  });

  it("false si le club a même joué plus de matchs (ne devrait pas arriver, mais pas de faux positif)", () => {
    expect(hasPendingMatchThisRound(6, 5)).toBe(false);
  });
});
