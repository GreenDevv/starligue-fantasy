import { describe, it, expect } from "vitest";
import { validatePointsConversion } from "./points-conversion";

describe("validatePointsConversion", () => {
  it("montant positif et disponible suffisant → valid, budgetGained arrondi au 0.1", () => {
    const result = validatePointsConversion({ availablePoints: 50, amount: 20, rate: 0.1 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.budgetGained).toBe(2);
  });

  it("montant nul → AMOUNT_NOT_POSITIVE", () => {
    const result = validatePointsConversion({ availablePoints: 50, amount: 0, rate: 0.1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "AMOUNT_NOT_POSITIVE")).toBe(true);
  });

  it("montant négatif → AMOUNT_NOT_POSITIVE", () => {
    const result = validatePointsConversion({ availablePoints: 50, amount: -5, rate: 0.1 });
    expect(result.errors.some((e) => e.code === "AMOUNT_NOT_POSITIVE")).toBe(true);
  });

  it("montant supérieur au disponible → AMOUNT_EXCEEDS_AVAILABLE avec le solde exact", () => {
    const result = validatePointsConversion({ availablePoints: 12.3, amount: 20, rate: 0.1 });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "AMOUNT_EXCEEDS_AVAILABLE");
    expect(err).toMatchObject({ code: "AMOUNT_EXCEEDS_AVAILABLE", available: 12.3 });
  });

  it("disponible négatif (déjà tout converti / recompute défavorable) → toute conversion refusée", () => {
    const result = validatePointsConversion({ availablePoints: -3, amount: 1, rate: 0.1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "AMOUNT_EXCEEDS_AVAILABLE")).toBe(true);
  });

  it("convertir exactement tout le solde disponible → valid", () => {
    const result = validatePointsConversion({ availablePoints: 30, amount: 30, rate: 0.1 });
    expect(result.valid).toBe(true);
    expect(result.budgetGained).toBe(3);
  });

  it("taux différent → budgetGained proportionnel", () => {
    const result = validatePointsConversion({ availablePoints: 100, amount: 40, rate: 0.25 });
    expect(result.budgetGained).toBe(10);
  });
});
