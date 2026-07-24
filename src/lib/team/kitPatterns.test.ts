import { describe, it, expect } from "vitest";
import { KIT_PATTERNS, KIT_PATTERN_BY_ID, DEFAULT_PATTERN_ID, getPattern } from "./kitPatterns";

describe("KIT_PATTERNS — intégrité du registre", () => {
  it("chaque motif a un id unique", () => {
    const ids = KIT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque motif a au moins une région", () => {
    for (const pattern of KIT_PATTERNS) {
      expect(pattern.regions.length).toBeGreaterThan(0);
    }
  });

  it("toute région référence un slot couvert par pattern.slots", () => {
    for (const pattern of KIT_PATTERNS) {
      for (const region of pattern.regions) {
        expect(region.slot).toBeGreaterThanOrEqual(0);
        expect(region.slot).toBeLessThan(pattern.slots);
      }
    }
  });

  it("toute région a au moins 3 points", () => {
    for (const pattern of KIT_PATTERNS) {
      for (const region of pattern.regions) {
        expect(region.points.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("DEFAULT_PATTERN_ID existe dans le registre", () => {
    expect(KIT_PATTERN_BY_ID[DEFAULT_PATTERN_ID]).toBeDefined();
  });

  it("getPattern renvoie le motif demandé s'il existe", () => {
    expect(getPattern("stripes-4").id).toBe("stripes-4");
  });

  it("getPattern retombe sur le motif par défaut pour un id inconnu", () => {
    expect(getPattern("does-not-exist").id).toBe(DEFAULT_PATTERN_ID);
  });
});
