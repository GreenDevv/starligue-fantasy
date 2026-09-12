import { describe, it, expect } from "vitest";
import { computePointsGroupIndices, pointsGroupBgClass } from "./points-color-groups";

describe("computePointsGroupIndices", () => {
  it("attribue le même index à des lignes consécutives à points égaux", () => {
    const indices = computePointsGroupIndices([{ points: 10 }, { points: 10 }, { points: 8 }]);
    expect(indices).toEqual([0, 0, 1]);
  });

  it("incrémente à chaque changement de points", () => {
    const indices = computePointsGroupIndices([{ points: 10 }, { points: 8 }, { points: 8 }, { points: 4 }]);
    expect(indices).toEqual([0, 1, 1, 2]);
  });

  it("un seul groupe si tout le monde a le même total", () => {
    expect(computePointsGroupIndices([{ points: 0 }, { points: 0 }])).toEqual([0, 0]);
  });

  it("liste vide → liste vide", () => {
    expect(computePointsGroupIndices([])).toEqual([]);
  });
});

describe("pointsGroupBgClass", () => {
  it("renvoie une classe différente pour des groupes adjacents", () => {
    expect(pointsGroupBgClass(0)).not.toBe(pointsGroupBgClass(1));
    expect(pointsGroupBgClass(1)).not.toBe(pointsGroupBgClass(2));
  });

  it("boucle proprement au-delà du nombre de couleurs disponibles", () => {
    expect(pointsGroupBgClass(0)).toBe(pointsGroupBgClass(5));
  });
});
