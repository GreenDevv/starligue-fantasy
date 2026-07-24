import { describe, it, expect } from "vitest";
import { planNextGameweek, planPreviousGameweek } from "./advance-plan";

describe("planNextGameweek", () => {
  it("saison pas commencée → journée 1", () => {
    expect(planNextGameweek(0, 30)).toBe(1);
  });

  it("en cours de saison → journée suivante", () => {
    expect(planNextGameweek(4, 30)).toBe(5);
  });

  it("dernière journée déjà jouée → saison terminée (null)", () => {
    expect(planNextGameweek(30, 30)).toBeNull();
  });

  it("au-delà de la dernière journée → null (garde-fou)", () => {
    expect(planNextGameweek(31, 30)).toBeNull();
  });
});

describe("planPreviousGameweek", () => {
  it("saison pas commencée (J0) → rien à annuler (null)", () => {
    expect(planPreviousGameweek(0)).toBeNull();
  });

  it("en cours de saison → annule la journée courante", () => {
    expect(planPreviousGameweek(5)).toBe(5);
  });

  it("dernière journée jouée → annule cette dernière journée", () => {
    expect(planPreviousGameweek(30)).toBe(30);
  });
});
