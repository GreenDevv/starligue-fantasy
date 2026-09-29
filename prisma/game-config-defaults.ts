// Constantes de jeu par défaut — ARCHITECTURE.md §2.1, §2.2, §2.3.
// Partagées par le seed Starligue (prisma/seed.ts) et la mise en place du jeu
// Ligue Butagaz (scripts/setup-lfh-season.ts, ARCHITECTURE.md §35), qui y ajoute
// ses propres surcharges.
export const GAME_CONFIG: Record<string, string> = {
  INITIAL_BUDGET: process.env.INITIAL_BUDGET ?? "100.0",
  SQUAD_SIZE: "14",
  PLAYERS_PER_POSITION: "2",
  STARTERS_PER_POSITION: "1",
  MAX_PLAYERS_PER_CLUB: "3",
  RATING_BASELINE: "5", // note neutre
  RATING_MULTIPLIER: "4", // pointsBruts = (note - 5) × 4
  STARTER_MULTIPLIER: "1.0",
  BENCH_MULTIPLIER: "0.5",
  WIN_BONUS_ENABLED: "false",
  WIN_BONUS_POINTS: "2",
  // Bonus/malus "leader de journée" sur les stats détaillées de boxscore (src/lib/scoring/stat-leaders.ts)
  STAT_LEADER_BONUS_ENABLED: "true",
  STAT_LEADER_BONUS_POINTS: "2",
  STAT_LEADER_MALUS_POINTS: "2",
  // API-Sports — à confirmer via GET https://v1.handball.api-sports.io/leagues
  API_SPORTS_LEAGUE_ID: process.env.API_SPORTS_LEAGUE_ID ?? "27",
  // Capitaine, valeur dynamique, joker médical — voir ARCHITECTURE.md "v2"
  CAPTAIN_MULTIPLIER: "2.0",
  // Bonus de saison (src/lib/scoring/engine.ts::applySeasonBonus) — 4 types, 1×/saison
  // chacun, quota global de 3 activations/saison (src/app/api/my-team/bonus/route.ts)
  TRIPLE_CAPTAIN_MULTIPLIER: "3.0",
  BENCH_BOOST_MULTIPLIER: "1.0",
  STAT_BONUS_MULTIPLIER: "1.0",
  STATISTICIAN_MULTIPLIER: "2.0",
  SEASON_BONUS_QUOTA_PER_SEASON: "3",
  VALUE_ADJUSTMENT_STEP: "0.5",
  VALUE_ADJUSTMENT_TOP_N: "5",
  VALUE_ADJUSTMENT_BOTTOM_N: "5",
  VALUE_ADJUSTMENT_MIN: "1.0",
  JOKER_QUOTA_PER_SEASON: "2",
  // Points → budget et trades entre managers — voir src/lib/budget/points-conversion.ts, src/lib/trades/proposal.ts
  POINTS_TO_BUDGET_RATE: "0.1",
  TRADE_PROPOSAL_EXPIRY_HOURS: "72",
  // Pronostics de journée — src/lib/predictions/*, ARCHITECTURE.md §14
  PREDICTION_MULTIPLIER_MIN: "0",
  PREDICTION_MULTIPLIER_MAX: "2.0",
  PREDICTION_LOCK_MINUTES_BEFORE_KICKOFF: "5",
  PREDICTION_BOOKMAKER_MARGIN: "0.08",
  PREDICTION_STRENGTH_SCALE: "4.0",
  PREDICTION_MAX_SKEW: "0.3",
  PREDICTION_BASE_PROB_HOME: "0.45",
  PREDICTION_BASE_PROB_DRAW: "0.10",
  PREDICTION_BASE_PROB_AWAY: "0.45",
  // Notifications push (app mobile) — ARCHITECTURE.md §20.2
  NOTIFICATION_LEAD_MINUTES: "60",
  // Points d'accueil (arrivée en cours de saison) — src/lib/scoring/catchup.ts, ARCHITECTURE.md §13.7
  CATCHUP_ENABLED: "true",
  CATCHUP_FACTOR: "0.7", // médiane globale de la journée × 0,7 (malus d'arrivée tardive)
};
