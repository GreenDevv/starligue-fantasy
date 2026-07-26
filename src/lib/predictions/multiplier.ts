// Multiplicateur de journée issu des pronostics — ARCHITECTURE.md §14. Fonction
// PURE : aucun effet de bord, aucun import Prisma.

export interface MultiplierConfig {
  min: number; // défaut 0 — 0 pronostic tenté juste sur la journée
  max: number; // défaut 2.0 — tous les pronostics tentés justes
}

export const DEFAULT_MULTIPLIER_CONFIG: MultiplierConfig = { min: 0, max: 2.0 };

export interface PredictionAttempt {
  correct: boolean;
}

/**
 * multiplicateur = min + (max - min) × (justes / tentés)
 * Aucun pronostic tenté cette journée → 1 (neutre) : on ne pénalise jamais
 * l'absence de pari, seulement un pari tenté et raté (voir applyMultiplier).
 */
export function computeGameweekMultiplier(
  attempts: PredictionAttempt[],
  config: MultiplierConfig = DEFAULT_MULTIPLIER_CONFIG,
): number {
  if (attempts.length === 0) return 1;
  const correctCount = attempts.filter((a) => a.correct).length;
  const fraction = correctCount / attempts.length;
  const multiplier = config.min + (config.max - config.min) * fraction;
  return Math.round(multiplier * 1000) / 1000;
}

/**
 * Applique le multiplicateur aux points de la journée d'un lineup — uniquement si
 * les points sont positifs (une mauvaise journée de joueurs n'est jamais amplifiée
 * par de bons pronostics, ni allégée par de mauvais : le multiplicateur reste sans
 * effet sur du négatif ou du zéro).
 */
export function applyMultiplier(points: number, multiplier: number): number {
  if (points <= 0) return points;
  return Math.round(points * multiplier * 10) / 10;
}

/** Convertit les valeurs GameConfig (string) en MultiplierConfig typé. */
export function parseMultiplierConfig(
  raw: Record<string, string>,
  overrides: Partial<MultiplierConfig> = {},
): MultiplierConfig {
  return {
    min: parseFloat(raw["PREDICTION_MULTIPLIER_MIN"] ?? "0"),
    max: parseFloat(raw["PREDICTION_MULTIPLIER_MAX"] ?? "2.0"),
    ...overrides,
  };
}
