import { describe, it, expect } from "vitest";
import { hasLiveSeasonStarted, hasSimulationSeasonStarted } from "./season-lock";

describe("hasLiveSeasonStarted", () => {
  it("false si aucune journée programmée", () => {
    expect(hasLiveSeasonStarted([], new Date("2026-08-01"))).toBe(false);
  });

  it("false avant la deadline de la 1ère journée", () => {
    const deadlines = [new Date("2026-09-01"), new Date("2026-09-08")];
    expect(hasLiveSeasonStarted(deadlines, new Date("2026-08-15"))).toBe(false);
  });

  it("true dès que la deadline de la 1ère journée est passée", () => {
    const deadlines = [new Date("2026-09-01"), new Date("2026-09-08")];
    expect(hasLiveSeasonStarted(deadlines, new Date("2026-09-01"))).toBe(true);
    expect(hasLiveSeasonStarted(deadlines, new Date("2026-09-15"))).toBe(true);
  });

  it("compare à la journée la plus ancienne, peu importe l'ordre du tableau", () => {
    const deadlines = [new Date("2026-09-08"), new Date("2026-09-01"), new Date("2026-09-15")];
    expect(hasLiveSeasonStarted(deadlines, new Date("2026-09-02"))).toBe(true);
  });
});

describe("hasSimulationSeasonStarted", () => {
  it("false au curseur 0 (pré-saison)", () => {
    expect(hasSimulationSeasonStarted(0)).toBe(false);
  });

  it("true dès que le curseur avance", () => {
    expect(hasSimulationSeasonStarted(1)).toBe(true);
    expect(hasSimulationSeasonStarted(13)).toBe(true);
  });
});
