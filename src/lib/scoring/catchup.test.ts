import { describe, it, expect } from "vitest";
import {
  median,
  computeCatchupCredit,
  firstEligibleGameweekNumber,
  parseCatchupConfig,
  DEFAULT_CATCHUP_CONFIG,
} from "./catchup";

describe("median", () => {
  it("liste vide → 0", () => {
    expect(median([])).toBe(0);
  });

  it("liste impaire → valeur centrale", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("liste paire → moyenne des deux centrales", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("ne modifie pas l'entrée", () => {
    const input = [5, 1, 3];
    median(input);
    expect(input).toEqual([5, 1, 3]);
  });

  it("gère les négatifs", () => {
    expect(median([-10, -2, -30])).toBe(-10);
  });
});

describe("computeCatchupCredit", () => {
  it("médiane × facteur, arrondi à 1 décimale", () => {
    // médiane [10,20,30,40,55] = 30 → ×0.7 (défaut) = 21
    expect(computeCatchupCredit([10, 20, 30, 40, 55])).toBe(21);
  });

  it("facteur configurable", () => {
    expect(computeCatchupCredit([20, 40], { enabled: true, factor: 1 })).toBe(30);
  });

  it("aucune donnée → 0", () => {
    expect(computeCatchupCredit([])).toBe(0);
  });

  it("médiane négative → crédit négatif (journée globalement ratée)", () => {
    expect(computeCatchupCredit([-20, -10, -6], { enabled: true, factor: 1 })).toBe(-10);
  });

  it("arrondit à 1 décimale", () => {
    // médiane [11,16] = 13.5 → ×0.9 = 12.15 → 12.2
    expect(computeCatchupCredit([11, 16], { enabled: true, factor: 0.9 })).toBe(12.2);
  });
});

describe("firstEligibleGameweekNumber", () => {
  const gws = [
    { number: 1, deadlineAt: new Date("2026-09-01T18:00:00Z") },
    { number: 2, deadlineAt: new Date("2026-09-08T18:00:00Z") },
    { number: 3, deadlineAt: new Date("2026-09-15T18:00:00Z") },
    { number: 4, deadlineAt: new Date("2026-09-22T18:00:00Z") },
  ];

  it("confirmé avant J1 → éligible dès J1 (aucune journée manquée)", () => {
    expect(firstEligibleGameweekNumber(gws, new Date("2026-08-20T00:00:00Z"))).toBe(1);
  });

  it("confirmé entre J2 et J3 → première éligible = J3", () => {
    expect(firstEligibleGameweekNumber(gws, new Date("2026-09-10T12:00:00Z"))).toBe(3);
  });

  it("confirmé pile à la deadline de J2 → J2 encore jouable", () => {
    expect(firstEligibleGameweekNumber(gws, new Date("2026-09-08T18:00:00Z"))).toBe(2);
  });

  it("confirmé après la dernière deadline → null", () => {
    expect(firstEligibleGameweekNumber(gws, new Date("2026-10-01T00:00:00Z"))).toBeNull();
  });

  it("ordre des journées en entrée indifférent", () => {
    const shuffled = [...gws].reverse();
    expect(firstEligibleGameweekNumber(shuffled, new Date("2026-09-10T12:00:00Z"))).toBe(3);
  });
});

describe("parseCatchupConfig", () => {
  it("valeurs par défaut", () => {
    expect(parseCatchupConfig({})).toEqual(DEFAULT_CATCHUP_CONFIG);
  });

  it("lit CATCHUP_ENABLED / CATCHUP_FACTOR", () => {
    expect(parseCatchupConfig({ CATCHUP_ENABLED: "false", CATCHUP_FACTOR: "1.0" })).toEqual({
      enabled: false,
      factor: 1,
    });
  });

  it("overrides prioritaires", () => {
    expect(parseCatchupConfig({ CATCHUP_FACTOR: "0.5" }, { factor: 0.8 }).factor).toBe(0.8);
  });
});
