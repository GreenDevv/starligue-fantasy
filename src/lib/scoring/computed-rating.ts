// Note de match calculée par nous — ARCHITECTURE.md §35.3.
// Fonctions PURES : aucun effet de bord, aucun import Prisma.
//
// Pour une compétition sans note officielle (LFH, profil ratingSource "COMPUTED"),
// la note stockée dans PlayerMatchStat.lnhRating est calculée ici à partir des
// stats du match, puis passe dans le moteur de points habituel (engine.ts,
// (note − baseline) × multiplicateur) sans qu'il sache d'où elle vient.
//
// Poids par défaut = « Score LNH » officiel rétro-ingéniéré : régression linéaire
// sur 7 988 lignes joueur-match de la prod (2025/26 + 2026/27, 29/09/2026) →
// R² 0,995 champ / 0,991 gardiens avec ces poids arrondis. La note LNH n'est donc
// qu'une somme pondérée du boxscore ; on applique la même aux joueuses sur les
// stats que la LFH publie. Une stat absente (null) compte pour 0.
//
// Stats absentes côté LFH (passes, ballons récupérés, pertes, 7 m/2 min
// provoqués) → la formule réduite sous-note surtout les postes qui vivent de ces
// stats (demi-centre : −4,7 en moyenne, les passes décisives). D'où `base` : une
// note ajoutée à toute joueuse qui a joué, PAR POSTE, mesurée sur les hommes =
// moyenne(note LNH) − moyenne(formule réduite) par poste, même jeu de données.
// Résultat : moyennes par poste des joueuses J1-J4 2026/27 alignées sur celles
// de la note LNH masculine (DC 9,1 vs 9,0 ; GB 8,2 vs 8,5…) et, côté hommes,
// formule réduite + base ↔ note LNH : R² 0,85 (0,61 sans base).
// Pour appliquer la formule LNH brute (stats complètes), passer ZERO_POSITION_BASE.

import type { Position } from "@prisma/client";

export interface RatingStats {
  goalsTotal: number | null; // buts, 7 m compris
  shotsTotal: number | null; // tentatives, 7 m comprises
  assists: number | null;
  ballsRecovered: number | null;
  penaltiesDrawn: number | null;
  twoMinDrawn: number | null;
  turnovers: number | null;
  twoMinTaken: number | null;
  disqualified: number | null;
  saves: number | null; // gardiens
  shotsFaced: number | null; // gardiens — arrêts + buts encaissés
}

export interface ComputedRatingWeights {
  goal: number; // par but (net : le tir qui l'a produit n'est pas compté en tir raté)
  missedShot: number; // par tir non converti
  assist: number;
  ballRecovered: number;
  penaltyDrawn: number;
  twoMinDrawn: number;
  turnover: number;
  twoMinTaken: number;
  disqualified: number;
  save: number;
  goalConceded: number;
  base: Record<Position, number>; // ajoutée à toute joueuse qui a joué, selon son poste
}

export const ZERO_POSITION_BASE: Record<Position, number> = { GK: 0, LW: 0, LB: 0, CB: 0, RB: 0, RW: 0, PV: 0 };

export const DEFAULT_COMPUTED_RATING_WEIGHTS: ComputedRatingWeights = {
  goal: 1.9,
  missedShot: -0.35,
  assist: 1,
  ballRecovered: 1,
  penaltyDrawn: 1,
  twoMinDrawn: 1,
  turnover: -1,
  twoMinTaken: -2,
  disqualified: -1.5,
  save: 1.5,
  goalConceded: -0.1,
  base: { GK: 0.7, LW: 0.9, LB: 2.5, CB: 4.7, RB: 3.1, RW: 0.7, PV: 0.9 },
};

const n = (v: number | null) => v ?? 0;

/**
 * Note d'un match. null si la joueuse n'a pas joué (le moteur donne alors 0 point,
 * comme pour un joueur non noté par la LNH). Arrondie à 0,1 comme la note LNH
 * (colonne Decimal(3,1)).
 */
export function computeMatchRating(
  stats: RatingStats,
  opts: { played: boolean; position: Position },
  w: ComputedRatingWeights = DEFAULT_COMPUTED_RATING_WEIGHTS
): number | null {
  if (!opts.played) return null;

  const goals = n(stats.goalsTotal);
  // Tentatives inconnues (null) → aucun tir raté plutôt qu'un nombre négatif.
  const missed = stats.shotsTotal === null ? 0 : Math.max(0, stats.shotsTotal - goals);
  const saves = n(stats.saves);
  const conceded = stats.shotsFaced === null ? 0 : Math.max(0, stats.shotsFaced - saves);

  const value =
    w.base[opts.position] +
    w.goal * goals +
    w.missedShot * missed +
    w.assist * n(stats.assists) +
    w.ballRecovered * n(stats.ballsRecovered) +
    w.penaltyDrawn * n(stats.penaltiesDrawn) +
    w.twoMinDrawn * n(stats.twoMinDrawn) +
    w.turnover * n(stats.turnovers) +
    w.twoMinTaken * n(stats.twoMinTaken) +
    w.disqualified * n(stats.disqualified) +
    w.save * saves +
    w.goalConceded * conceded;

  // 16,05 vaut 16,0499… en flottant : on purge d'abord le bruit au millième
  // (poids à 2 décimales max), puis arrondi au dixième → 16,1 comme à la main.
  return Math.round(Math.round(value * 1000) / 100) / 10;
}

const WEIGHT_KEYS: Record<Exclude<keyof ComputedRatingWeights, "base">, string> = {
  goal: "COMPUTED_RATING_GOAL",
  missedShot: "COMPUTED_RATING_MISSED_SHOT",
  assist: "COMPUTED_RATING_ASSIST",
  ballRecovered: "COMPUTED_RATING_BALL_RECOVERED",
  penaltyDrawn: "COMPUTED_RATING_PENALTY_DRAWN",
  twoMinDrawn: "COMPUTED_RATING_TWO_MIN_DRAWN",
  turnover: "COMPUTED_RATING_TURNOVER",
  twoMinTaken: "COMPUTED_RATING_TWO_MIN_TAKEN",
  disqualified: "COMPUTED_RATING_DISQUALIFIED",
  save: "COMPUTED_RATING_SAVE",
  goalConceded: "COMPUTED_RATING_GOAL_CONCEDED",
};

const readNumber = (raw: Record<string, string>, key: string): number | null => {
  const parsed = raw[key] === undefined ? NaN : parseFloat(raw[key]);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Convertit les valeurs GameConfig (string) en poids typés ; clé absente ou
 * illisible → défaut. Bases par poste : COMPUTED_RATING_BASE_GK, …_LW, etc.
 */
export function parseComputedRatingWeights(raw: Record<string, string>): ComputedRatingWeights {
  const out: ComputedRatingWeights = { ...DEFAULT_COMPUTED_RATING_WEIGHTS, base: { ...DEFAULT_COMPUTED_RATING_WEIGHTS.base } };
  for (const [field, key] of Object.entries(WEIGHT_KEYS) as [Exclude<keyof ComputedRatingWeights, "base">, string][]) {
    out[field] = readNumber(raw, key) ?? out[field];
  }
  for (const pos of Object.keys(out.base) as Position[]) {
    out.base[pos] = readNumber(raw, `COMPUTED_RATING_BASE_${pos}`) ?? out.base[pos];
  }
  return out;
}
