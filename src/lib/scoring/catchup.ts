// "Points d'accueil" — ARCHITECTURE.md §13.7
// Fonctions PURES : aucun effet de bord, aucun import Prisma.
//
// Problème : une équipe qui rejoint une ligue en cours de saison démarre à 0 pt
// alors que les autres ont déjà cumulé N journées → mathématiquement hors course.
// Solution : pour chaque journée notée AVANT la première journée que l'arrivant
// pouvait jouer, on lui crédite la médiane des points réellement marqués par les
// managers cette journée-là, × un facteur (défaut 0,9 : léger malus qui décourage
// d'attendre et compense l'avantage de constituer son effectif en connaissance de
// cause). Hypothèse : un nouveau manager est ~dans la moyenne → ni avantagé, ni
// condamné, il grimpe ou descend ensuite à son mérite.

export interface CatchupConfig {
  enabled: boolean;
  factor: number; // CATCHUP_FACTOR — multiplie la médiane (défaut 0,9)
}

export const DEFAULT_CATCHUP_CONFIG: CatchupConfig = {
  enabled: true,
  factor: 0.9,
};

export function parseCatchupConfig(
  raw: Record<string, string>,
  overrides: Partial<CatchupConfig> = {},
): CatchupConfig {
  return {
    enabled: (raw["CATCHUP_ENABLED"] ?? "true") === "true",
    factor: parseFloat(raw["CATCHUP_FACTOR"] ?? "0.9"),
    ...overrides,
  };
}

/** Médiane d'une liste de nombres. [] → 0. Ne modifie pas l'entrée. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Crédit d'accueil pour UNE journée manquée.
 * @param realGameweekPoints points réels marqués par chaque équipe qui a joué la
 *   journée (les lignes d'accueil elles-mêmes sont exclues par l'appelant).
 * @returns médiane × factor, arrondi à 1 décimale. Peut être négatif si la médiane
 *   de la journée l'était (journée globalement ratée par les managers).
 */
export function computeCatchupCredit(
  realGameweekPoints: number[],
  config: CatchupConfig = DEFAULT_CATCHUP_CONFIG,
): number {
  const credit = median(realGameweekPoints) * config.factor;
  return Math.round(credit * 10) / 10;
}

/**
 * Numéro de la première journée qu'une équipe pouvait réellement jouer : la
 * première dont la deadline tombe à ou après la confirmation de l'effectif.
 * Toute journée notée d'un numéro STRICTEMENT inférieur est "manquée".
 * @param gameweeks toutes les journées de la saison ({ number, deadlineAt }).
 * @param confirmedAt FantasyTeam.validatedAt (ou createdAt en fallback).
 * @returns le numéro, ou null si l'équipe a confirmé après la dernière deadline
 *   connue (aucune journée future à jouer → aucun accueil non plus).
 */
export function firstEligibleGameweekNumber(
  gameweeks: { number: number; deadlineAt: Date }[],
  confirmedAt: Date,
): number | null {
  const eligible = gameweeks
    .filter((gw) => gw.deadlineAt.getTime() >= confirmedAt.getTime())
    .sort((a, b) => a.number - b.number);
  return eligible[0]?.number ?? null;
}
