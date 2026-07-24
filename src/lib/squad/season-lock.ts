// Verrouillage du rebuild complet d'effectif (/team/build) — fonctions PURES,
// aucun import Prisma. Avant le début de la saison, l'effectif peut être
// entièrement reconstruit à volonté (phase de draft). Une fois la saison
// commencée, seuls Transferts (marché, fenêtre ouverte) et Trades (toute la
// saison, voir src/app/api/trades) peuvent modifier l'effectif — le rebuild
// complet est interdit pour ne pas contourner budget/fenêtre/trades.

/** Jeu en direct : la saison a commencé dès que la deadline de la 1ère journée est passée. */
export function hasLiveSeasonStarted(gameweekDeadlines: Date[], now: Date): boolean {
  if (gameweekDeadlines.length === 0) return false;
  const earliest = gameweekDeadlines.reduce((min, d) => (d < min ? d : min));
  return now >= earliest;
}

/** Mode Simulation : le curseur global (Season.currentSimulationGameweekNumber) vaut 0 en pré-saison. */
export function hasSimulationSeasonStarted(currentSimulationGameweekNumber: number): boolean {
  return currentSimulationGameweekNumber > 0;
}
