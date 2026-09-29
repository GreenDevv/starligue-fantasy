import { describe, it, expect } from "vitest";
import { getCompetitionId, getCompetitionProfile } from "./profile";

describe("getCompetitionId", () => {
  it("LNH par défaut quand la variable est absente ou vide", () => {
    expect(getCompetitionId({})).toBe("LNH");
    expect(getCompetitionId({ NEXT_PUBLIC_COMPETITION: "  " })).toBe("LNH");
  });

  it("lit LFH, insensible à la casse", () => {
    expect(getCompetitionId({ NEXT_PUBLIC_COMPETITION: "lfh" })).toBe("LFH");
  });

  it("refuse une valeur inconnue au lieu de servir le mauvais jeu", () => {
    expect(() => getCompetitionId({ NEXT_PUBLIC_COMPETITION: "EHF" })).toThrow(/NEXT_PUBLIC_COMPETITION/);
  });
});

describe("getCompetitionProfile", () => {
  it("LNH : note officielle, toutes les fonctionnalités lnh.fr actives", () => {
    const p = getCompetitionProfile("LNH");
    expect(p.ratingSource).toBe("LNH_OFFICIAL");
    expect(Object.values(p.features).every(Boolean)).toBe(true);
  });

  it("LFH : note calculée, fonctionnalités adossées à lnh.fr coupées", () => {
    const p = getCompetitionProfile("LFH");
    expect(p.gender).toBe("F");
    expect(p.ratingSource).toBe("COMPUTED");
    expect(Object.values(p.features).some(Boolean)).toBe(false);
  });
});
