import { describe, it, expect } from "vitest";
import {
  computeMatchRating,
  parseComputedRatingWeights,
  DEFAULT_COMPUTED_RATING_WEIGHTS,
  ZERO_POSITION_BASE,
  type RatingStats,
} from "./computed-rating";

const EMPTY: RatingStats = {
  goalsTotal: null,
  shotsTotal: null,
  assists: null,
  ballsRecovered: null,
  penaltiesDrawn: null,
  twoMinDrawn: null,
  turnovers: null,
  twoMinTaken: null,
  disqualified: null,
  saves: null,
  shotsFaced: null,
};

// Formule LNH brute (sans base par poste) pour vérifier les poids un par un.
const RAW = { ...DEFAULT_COMPUTED_RATING_WEIGHTS, base: ZERO_POSITION_BASE };
const lb = { played: true, position: "LB" as const };
const gk = { played: true, position: "GK" as const };

describe("computeMatchRating", () => {
  it("null si la joueuse n'a pas joué (0 point côté moteur)", () => {
    expect(computeMatchRating({ ...EMPTY, goalsTotal: 3 }, { played: false, position: "LB" })).toBeNull();
  });

  it("joueuse de champ avec les seules stats LFH : buts, tirs ratés, 2 min", () => {
    // Clarisse MAIROT, Brest–Besançon J1 2026/27 : 9 buts / 12 tirs, 0 × 2 min
    // → 9 × 1,9 + 3 × −0,35 = 17,1 − 1,05 = 16,05 → 16,1 (arrondi Math.round)
    expect(computeMatchRating({ ...EMPTY, goalsTotal: 9, shotsTotal: 12, twoMinTaken: 0 }, lb, RAW)).toBe(16.1);
  });

  it("gardienne : arrêts et buts encaissés", () => {
    // Floriane ANDRE, même match : 15 arrêts / 35 tirs subis → 15 × 1,5 + 20 × −0,1 = 20,5
    expect(computeMatchRating({ ...EMPTY, saves: 15, shotsFaced: 35 }, gk, RAW)).toBe(20.5);
  });

  it("reproduit la note LNH d'une ligne masculine complète", () => {
    // Ligne prod réelle (ailier, note LNH 9,0) : 3 buts / 3 tirs, 1 passe, 3 récup, 1 perte.
    const r = computeMatchRating(
      { ...EMPTY, goalsTotal: 3, shotsTotal: 3, assists: 1, ballsRecovered: 3, turnovers: 1, twoMinTaken: 0, disqualified: 0 },
      { played: true, position: "LW" },
      RAW
    );
    expect(r).toBeCloseTo(8.7, 1); // 5,7 + 1 + 3 − 1 ; écart 0,3 = ordre de grandeur de l'erreur moyenne (0,22)
  });

  it("sanctions : 2 min et disqualification négatives", () => {
    expect(computeMatchRating({ ...EMPTY, twoMinTaken: 2, disqualified: 1 }, lb, RAW)).toBe(-5.5);
  });

  it("tirs inconnus : aucun tir raté compté, jamais de tirs ratés négatifs", () => {
    expect(computeMatchRating({ ...EMPTY, goalsTotal: 2, shotsTotal: null }, lb, RAW)).toBe(3.8);
    expect(computeMatchRating({ ...EMPTY, goalsTotal: 2, shotsTotal: 1 }, lb, RAW)).toBe(3.8);
  });

  it("base par défaut selon le poste : compense surtout la demi-centre (passes non publiées)", () => {
    expect(computeMatchRating(EMPTY, { played: true, position: "CB" })).toBe(4.7);
    expect(computeMatchRating(EMPTY, { played: true, position: "PV" })).toBe(0.9);
    // Même match, même stats : la base s'ajoute à la formule brute.
    expect(computeMatchRating({ ...EMPTY, goalsTotal: 9, shotsTotal: 12 }, lb)).toBe(18.6); // 16,05 + 2,5
  });
});

describe("parseComputedRatingWeights", () => {
  it("défauts si GameConfig absent", () => {
    expect(parseComputedRatingWeights({})).toEqual(DEFAULT_COMPUTED_RATING_WEIGHTS);
  });

  it("lit les valeurs fournies, ignore les valeurs illisibles", () => {
    const w = parseComputedRatingWeights({ COMPUTED_RATING_BASE_CB: "4", COMPUTED_RATING_GOAL: "2", COMPUTED_RATING_SAVE: "abc" });
    expect(w.base.CB).toBe(4);
    expect(w.base.LB).toBe(DEFAULT_COMPUTED_RATING_WEIGHTS.base.LB);
    expect(w.goal).toBe(2);
    expect(w.save).toBe(DEFAULT_COMPUTED_RATING_WEIGHTS.save);
    // Pas de mutation des défauts partagés.
    expect(DEFAULT_COMPUTED_RATING_WEIGHTS.base.CB).toBe(4.7);
  });
});
