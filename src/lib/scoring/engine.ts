// Moteur de scoring — ARCHITECTURE.md §2.3
// Fonctions PURES : aucun effet de bord, aucun import Prisma.

export type SquadRole = "STARTER" | "BENCH";

// Bonus de saison — 4 types, chacun activable au maximum une fois par saison, un
// seul actif par journée (voir FantasyTeam.pendingBonus / FantasyBonusUsage). Quota
// global de 3 activations/saison sur les 4 (GameConfig SEASON_BONUS_QUOTA_PER_SEASON,
// appliqué côté API — src/app/api/my-team/bonus/route.ts — pas dans ce moteur pur).
export type BonusType = "TRIPLE_CAPTAIN" | "BENCH_BOOST" | "INSURANCE" | "STATISTICIAN";

export interface ScoringConfig {
  ratingBaseline: number;   // défaut 5
  ratingMultiplier: number; // défaut 4  → pointsBruts = (note - 5) × 4
  starterMultiplier: number; // défaut 1.0
  benchMultiplier: number;  // défaut 0.5
  winBonusEnabled: boolean;
  winBonusPoints: number;   // défaut 2
  captainMultiplier: number; // défaut 2.0 — appliqué en plus du multiplicateur titulaire/banc
  statLeaderBonusEnabled: boolean; // défaut true — bonus/malus "leader de journée" (src/lib/scoring/stat-leaders.ts)
  statLeaderBonusPoints: number;   // défaut 2
  statLeaderMalusPoints: number;   // défaut 2 (magnitude positive, appliqué en négatif)
  tripleCaptainMultiplier: number; // défaut 3.0 — remplace captainMultiplier la journée où le bonus Triple Capitaine est actif
  benchBoostMultiplier: number;    // défaut 1.0 — remplace benchMultiplier (×1 classique) la journée où le bonus Bench Boost est actif
  statBonusMultiplier: number;     // défaut 1.0 — multiplie statBonusPoints ; substitué par statisticianMultiplier quand le bonus Statisticien est actif
  statisticianMultiplier: number;  // défaut 2.0 — remplace statBonusMultiplier la journée où le bonus Statisticien est actif
}

export const DEFAULT_CONFIG: ScoringConfig = {
  ratingBaseline: 5,
  ratingMultiplier: 4,
  starterMultiplier: 1.0,
  benchMultiplier: 0.5,
  winBonusEnabled: false,
  winBonusPoints: 2,
  captainMultiplier: 2.0,
  statLeaderBonusEnabled: true,
  statLeaderBonusPoints: 2,
  statLeaderMalusPoints: 2,
  tripleCaptainMultiplier: 3.0,
  benchBoostMultiplier: 1.0,
  statBonusMultiplier: 1.0,
  statisticianMultiplier: 2.0,
};

/**
 * Dérive la config effective pour une journée où un bonus de saison est actif.
 * Le reste du moteur (computePlayerPoints) reste inchangé : seul le multiplicateur
 * concerné est substitué. INSURANCE n'est pas une substitution de multiplicateur
 * (c'est un plancher par joueur) — géré directement dans computeLineupPoints.
 */
export function applySeasonBonus(
  config: ScoringConfig,
  bonus: BonusType | null | undefined,
): ScoringConfig {
  if (bonus === "TRIPLE_CAPTAIN") {
    return { ...config, captainMultiplier: config.tripleCaptainMultiplier };
  }
  if (bonus === "BENCH_BOOST") {
    return { ...config, benchMultiplier: config.benchBoostMultiplier };
  }
  if (bonus === "STATISTICIAN") {
    return { ...config, statBonusMultiplier: config.statisticianMultiplier };
  }
  return config;
}

export interface PlayerInput {
  lnhRating: number | null; // null = non noté / n'a pas joué
  played: boolean;
  role: SquadRole;
  teamWon: boolean; // club du joueur a-t-il gagné ?
  isCaptain?: boolean; // défaut false — bonus appliqué seulement si le capitaine est titulaire cette journée-là (voir role)
  statBonusPoints?: number; // défaut 0 — cumul bonus/malus "leader de journée" (src/lib/scoring/stat-leaders.ts), déjà signé (positif ou négatif)
}

/**
 * Calcule les points d'un joueur pour un match.
 * §2.3 : pointsBruts = (note - baseline) × multiplier, arrondi à 1 décimale.
 * Joueur non noté ou absent → 0 point. Capitaine → ×captainMultiplier en plus.
 */
export function computePlayerPoints(
  player: PlayerInput,
  config: ScoringConfig = DEFAULT_CONFIG,
): number {
  if (player.lnhRating === null || !player.played) return 0;

  const rawPoints = (player.lnhRating - config.ratingBaseline) * config.ratingMultiplier;
  const multiplier =
    player.role === "STARTER" ? config.starterMultiplier : config.benchMultiplier;
  let points = rawPoints * multiplier;

  if (player.isCaptain) {
    points *= config.captainMultiplier;
  }

  if (config.winBonusEnabled && player.teamWon && player.played) {
    points += config.winBonusPoints;
  }

  points += (player.statBonusPoints ?? 0) * config.statBonusMultiplier;

  return Math.round(points * 10) / 10;
}

export interface LineupEntry {
  lnhRating: number | null;
  played: boolean;
  role: SquadRole;
  teamWon: boolean;
  isCaptain?: boolean;
  statBonusPoints?: number;
}

/**
 * Calcule les points totaux d'un lineup pour une journée.
 * §2.3 : pointsGameweek = Σ pointsJoueur des 14 joueurs.
 * `bonus` : bonus de saison actif ce jour-là (au plus un, voir applySeasonBonus).
 * INSURANCE : chaque joueur individuel est plancherné à 0 avant sommation (aucun
 * joueur ne peut faire perdre de points à l'équipe cette journée-là).
 */
export function computeLineupPoints(
  entries: LineupEntry[],
  config: ScoringConfig = DEFAULT_CONFIG,
  bonus?: BonusType | null,
): number {
  const effectiveConfig = applySeasonBonus(config, bonus);
  const total = entries.reduce((sum, e) => {
    const points = computePlayerPoints(e, effectiveConfig);
    return sum + (bonus === "INSURANCE" ? Math.max(0, points) : points);
  }, 0);
  return Math.round(total * 10) / 10;
}

/** Convertit les valeurs GameConfig (string) en ScoringConfig typé. */
export function parseScoringConfig(
  raw: Record<string, string>,
  overrides: Partial<ScoringConfig> = {},
): ScoringConfig {
  return {
    ratingBaseline: parseFloat(raw["RATING_BASELINE"] ?? "5"),
    ratingMultiplier: parseFloat(raw["RATING_MULTIPLIER"] ?? "4"),
    starterMultiplier: parseFloat(raw["STARTER_MULTIPLIER"] ?? "1.0"),
    benchMultiplier: parseFloat(raw["BENCH_MULTIPLIER"] ?? "0.5"),
    winBonusEnabled: (raw["WIN_BONUS_ENABLED"] ?? "false") === "true",
    winBonusPoints: parseFloat(raw["WIN_BONUS_POINTS"] ?? "2"),
    captainMultiplier: parseFloat(raw["CAPTAIN_MULTIPLIER"] ?? "2.0"),
    statLeaderBonusEnabled: (raw["STAT_LEADER_BONUS_ENABLED"] ?? "true") === "true",
    statLeaderBonusPoints: parseFloat(raw["STAT_LEADER_BONUS_POINTS"] ?? "2"),
    statLeaderMalusPoints: parseFloat(raw["STAT_LEADER_MALUS_POINTS"] ?? "2"),
    tripleCaptainMultiplier: parseFloat(raw["TRIPLE_CAPTAIN_MULTIPLIER"] ?? "3.0"),
    benchBoostMultiplier: parseFloat(raw["BENCH_BOOST_MULTIPLIER"] ?? "1.0"),
    statBonusMultiplier: parseFloat(raw["STAT_BONUS_MULTIPLIER"] ?? "1.0"),
    statisticianMultiplier: parseFloat(raw["STATISTICIAN_MULTIPLIER"] ?? "2.0"),
    ...overrides,
  };
}
