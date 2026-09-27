// Valorisation des joueurs à partir de leur Score LNH moyen d'une saison passée —
// fonction pure testée, ARCHITECTURE.md/CLAUDE.md (logique métier hors route handlers).
//
// Le "Score LNH" n'a pas la même échelle selon le poste (un pivot marque et
// "score" structurellement moins qu'un demi-centre — voir la mémoire
// lnh-season-scores-endpoint) : normaliser globalement pénaliserait injustement
// les pivots/ailiers. On normalise donc min-max *par poste*, puis on mappe vers
// la fourchette de valorisation du jeu (mêmes bornes que roundMV en Phase 3.6 :
// 4.0 à 20.0, arrondi au 0.5 le plus proche).

import type { Position } from "@/lib/squad/validation";

export interface ValuationConfig {
  minValue: number;
  maxValue: number;
}

export const DEFAULT_VALUATION_CONFIG: ValuationConfig = {
  minValue: 4.0,
  maxValue: 20.0,
};

export interface PlayerLnhScoreInput {
  playerId: string;
  position: Position;
  avgLnhScore: number;
}

export interface PlayerValuationResult {
  playerId: string;
  marketValue: number;
}

function roundToHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Valorise un groupe de joueurs déjà filtré au même poste (normalisation min-max).
function valuatePositionGroup(
  group: PlayerLnhScoreInput[],
  config: ValuationConfig
): PlayerValuationResult[] {
  if (group.length === 1) {
    // Un seul joueur noté à ce poste : aucune comparaison possible → valeur médiane du barème.
    return [{ playerId: group[0]!.playerId, marketValue: roundToHalf((config.minValue + config.maxValue) / 2) }];
  }

  const scores = group.map((g) => g.avgLnhScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return group.map((p) => {
    const normalized = max === min ? 0.5 : (p.avgLnhScore - min) / (max - min);
    const raw = config.minValue + normalized * (config.maxValue - config.minValue);
    return { playerId: p.playerId, marketValue: roundToHalf(clamp(raw, config.minValue, config.maxValue)) };
  });
}

// Calcule la valorisation de tous les joueurs fournis (uniquement ceux ayant un
// score — le tri "qui a un score ou pas" se fait en amont, côté appelant).
export function computeValuationsFromLnhScores(
  players: PlayerLnhScoreInput[],
  config: ValuationConfig = DEFAULT_VALUATION_CONFIG
): PlayerValuationResult[] {
  const byPosition = new Map<Position, PlayerLnhScoreInput[]>();
  for (const p of players) {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }

  const results: PlayerValuationResult[] = [];
  for (const group of byPosition.values()) {
    results.push(...valuatePositionGroup(group, config));
  }
  return results;
}

// Valorisation d'un joueur qui entre dans l'effectif EN COURS de saison (joueur
// lnh.fr absent de notre base, cf. src/lib/ingestion/lnh-roster-identity-sync.ts).
// Même barème par poste que ci-dessus, calculé sur le Score LNH de la saison en
// cours de TOUS les joueurs lnh.fr (référence), avec :
//  - un lissage des petits échantillons : moyenne = total / (matchs + shrinkMatches),
//    pour qu'un seul bon match ne fasse pas un joueur cher ;
//  - un plancher : total saison < minTotalForValue → minValue. Sans lui, un joueur
//    quasi nul d'un poste dont le minimum est négatif (pivots) sortait à 6,5 M.
// Grille validée le 2026-09-27 (46 joueurs, NAGY 13 M … 29+ joueurs à 4 M).
export interface NewcomerValuationConfig extends ValuationConfig {
  shrinkMatches: number;
  minTotalForValue: number;
}

export const DEFAULT_NEWCOMER_VALUATION_CONFIG: NewcomerValuationConfig = {
  ...DEFAULT_VALUATION_CONFIG,
  shrinkMatches: 2,
  minTotalForValue: 3,
};

export interface SeasonScoreInput {
  playerId: string; // identifiant arbitraire, stable entre référence et nouveaux
  position: Position;
  matchesPlayed: number;
  totalScore: number;
}

export function valueNewcomersFromSeasonScores(
  reference: SeasonScoreInput[],
  newcomerIds: string[],
  config: NewcomerValuationConfig = DEFAULT_NEWCOMER_VALUATION_CONFIG
): Map<string, number> {
  const played = reference.filter((r) => r.matchesPlayed > 0);
  const valued = new Map(
    computeValuationsFromLnhScores(
      played.map((r) => ({
        playerId: r.playerId,
        position: r.position,
        avgLnhScore: r.totalScore / (r.matchesPlayed + config.shrinkMatches),
      })),
      config
    ).map((v) => [v.playerId, v.marketValue])
  );
  const byId = new Map(reference.map((r) => [r.playerId, r]));

  const out = new Map<string, number>();
  for (const id of newcomerIds) {
    const r = byId.get(id);
    const eligible = r && r.matchesPlayed > 0 && r.totalScore >= config.minTotalForValue;
    out.set(id, eligible ? (valued.get(id) ?? config.minValue) : config.minValue);
  }
  return out;
}
