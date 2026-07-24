// Calcul des cotes de pronostic — ARCHITECTURE.md §14. Fonction PURE : aucun effet
// de bord, aucun import Prisma. La force de chaque club (paramètre d'entrée, pas
// calculée ici) est dérivée en amont de la valeur marchande moyenne de l'effectif
// actif (src/lib/predictions/compute-odds.ts) — cette fonction ne sait rien de la
// source, seulement comparer deux nombres de force.
//
// Purement informatif depuis le passage à 3 issues (1X2) — les cotes n'affectent
// plus rien dans le scoring (seul `resolveOutcome` compte pour le multiplicateur,
// voir src/lib/predictions/multiplier.ts), elles donnent juste un repère au joueur.
import type { PredictionOutcome } from "./outcome";

export interface OddsConfig {
  bookmakerMargin: number; // défaut 0.08 — marge retirée avant conversion probabilité → cote
  strengthScale: number; // défaut 4.0 — échelle de l'écart de force pour le tanh (skew)
  maxSkew: number; // défaut 0.3 — déplacement de probabilité max entre Domicile/Extérieur
  baseProb: Record<PredictionOutcome, number>; // distribution neutre (deux clubs de force égale), doit sommer à 1
}

export const DEFAULT_ODDS_CONFIG: OddsConfig = {
  bookmakerMargin: 0.08,
  strengthScale: 4.0,
  maxSkew: 0.3,
  baseProb: {
    HOME: 0.45,
    DRAW: 0.1,
    AWAY: 0.45,
  },
};

export interface OddsInput {
  homeStrength: number;
  awayStrength: number;
}

export type MatchOdds = Record<PredictionOutcome, number>;
export type MatchProbabilities = Record<PredictionOutcome, number>;

const OUTCOMES: PredictionOutcome[] = ["HOME", "DRAW", "AWAY"];

function clampProb(p: number): number {
  return Math.max(0.01, Math.min(0.98, p));
}

function normalize(probs: MatchProbabilities): MatchProbabilities {
  const sum = OUTCOMES.reduce((s, o) => s + probs[o], 0);
  const out = {} as MatchProbabilities;
  for (const o of OUTCOMES) out[o] = probs[o] / sum;
  return out;
}

/**
 * Probabilité implicite de chaque issue à partir de la force des deux clubs.
 * skew ∈ (-maxSkew, maxSkew) via tanh (borné même pour un écart de force énorme) ;
 * déplace la masse de probabilité entre Domicile et Extérieur, le nul reste fixe.
 * La somme des probabilités de base est déjà 1 et le déplacement est équilibré
 * (autant ajouté que retiré), donc la somme reste exactement 1 avant clamp/normalize
 * — le clamp+normalize ne sert qu'à rester robuste si un admin règle un maxSkew
 * disproportionné en GameConfig.
 */
export function computeMatchProbabilities(
  input: OddsInput,
  config: OddsConfig = DEFAULT_ODDS_CONFIG,
): MatchProbabilities {
  const diff = input.homeStrength - input.awayStrength;
  const skew = Math.tanh(diff / config.strengthScale) * config.maxSkew;

  const raw: MatchProbabilities = {
    HOME: clampProb(config.baseProb.HOME + skew),
    DRAW: clampProb(config.baseProb.DRAW),
    AWAY: clampProb(config.baseProb.AWAY - skew),
  };

  return normalize(raw);
}

/** Convertit une probabilité implicite en cote décimale, marge bookmaker déduite. */
function oddsFromProbability(prob: number, margin: number): number {
  const odds = (1 / prob) * (1 - margin);
  return Math.round(Math.max(1.01, Math.min(50, odds)) * 100) / 100;
}

export function computeMatchOdds(input: OddsInput, config: OddsConfig = DEFAULT_ODDS_CONFIG): MatchOdds {
  const probs = computeMatchProbabilities(input, config);
  const odds = {} as MatchOdds;
  for (const o of OUTCOMES) odds[o] = oddsFromProbability(probs[o], config.bookmakerMargin);
  return odds;
}

/** Convertit les valeurs GameConfig (string) en OddsConfig typé. */
export function parseOddsConfig(
  raw: Record<string, string>,
  overrides: Partial<OddsConfig> = {},
): OddsConfig {
  return {
    bookmakerMargin: parseFloat(raw["PREDICTION_BOOKMAKER_MARGIN"] ?? "0.08"),
    strengthScale: parseFloat(raw["PREDICTION_STRENGTH_SCALE"] ?? "4.0"),
    maxSkew: parseFloat(raw["PREDICTION_MAX_SKEW"] ?? "0.3"),
    baseProb: {
      HOME: parseFloat(raw["PREDICTION_BASE_PROB_HOME"] ?? "0.45"),
      DRAW: parseFloat(raw["PREDICTION_BASE_PROB_DRAW"] ?? "0.10"),
      AWAY: parseFloat(raw["PREDICTION_BASE_PROB_AWAY"] ?? "0.45"),
    },
    ...overrides,
  };
}
