// Résolution de l'issue d'un match en une des 3 issues pronostiquables (1X2) —
// ARCHITECTURE.md §14. Fonction PURE : aucun effet de bord, aucun import Prisma.

export type PredictionOutcome = "HOME" | "DRAW" | "AWAY";

/** Détermine l'issue à partir du score final. */
export function resolveOutcome(homeScore: number, awayScore: number): PredictionOutcome {
  if (homeScore > awayScore) return "HOME";
  if (homeScore < awayScore) return "AWAY";
  return "DRAW";
}
