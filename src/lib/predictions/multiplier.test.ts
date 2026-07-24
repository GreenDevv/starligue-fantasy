import { describe, it, expect } from "vitest";
import { computeGameweekMultiplier, applyMultiplier, DEFAULT_MULTIPLIER_CONFIG } from "./multiplier";

describe("computeGameweekMultiplier", () => {
  it("aucun pronostic tenté → 1 (neutre, jamais pénalisant)", () => {
    expect(computeGameweekMultiplier([])).toBe(1);
  });

  it("8/8 pronostics justes → ×2.0", () => {
    const attempts = Array.from({ length: 8 }, () => ({ correct: true }));
    expect(computeGameweekMultiplier(attempts)).toBe(2.0);
  });

  it("0/8 pronostics justes (tous tentés, tous faux) → ×0.5", () => {
    const attempts = Array.from({ length: 8 }, () => ({ correct: false }));
    expect(computeGameweekMultiplier(attempts)).toBe(0.5);
  });

  it("4/8 justes → milieu de l'échelle (×1.25)", () => {
    const attempts = [
      ...Array.from({ length: 4 }, () => ({ correct: true })),
      ...Array.from({ length: 4 }, () => ({ correct: false })),
    ];
    expect(computeGameweekMultiplier(attempts)).toBe(1.25);
  });

  it("robuste à un nombre de matchs différent de 8 (report/annulation)", () => {
    const attempts = Array.from({ length: 5 }, () => ({ correct: true }));
    expect(computeGameweekMultiplier(attempts)).toBe(2.0);
  });

  it("respecte un config personnalisé", () => {
    const attempts = [{ correct: true }, { correct: false }];
    expect(computeGameweekMultiplier(attempts, { min: 1, max: 3 })).toBe(2);
  });
});

describe("applyMultiplier", () => {
  it("points positifs → multipliés", () => {
    expect(applyMultiplier(10, 2)).toBe(20);
    expect(applyMultiplier(10, 0.5)).toBe(5);
  });

  it("points négatifs → inchangés, jamais amplifiés", () => {
    expect(applyMultiplier(-8, 2)).toBe(-8);
    expect(applyMultiplier(-8, 0.5)).toBe(-8);
  });

  it("points nuls → inchangés", () => {
    expect(applyMultiplier(0, 2)).toBe(0);
  });

  it("arrondi à 1 décimale", () => {
    expect(applyMultiplier(7, 1.25)).toBe(8.8); // 7 * 1.25 = 8.75 → 8.8
  });
});

describe("DEFAULT_MULTIPLIER_CONFIG", () => {
  it("min 0.5, max 2.0", () => {
    expect(DEFAULT_MULTIPLIER_CONFIG).toEqual({ min: 0.5, max: 2.0 });
  });
});
