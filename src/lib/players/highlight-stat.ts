// Choisit la ou les stats à mettre en avant sur une carte de performance selon
// le poste du joueur — fonction pure, testée. Un gardien se juge sur ses arrêts,
// un joueur de champ sur ses buts/passes décisives ; inutile d'afficher un "0
// arrêt" à un ailier ou un "0 but" à un gardien. Voir LivePerformancesCard.
import type { Position } from "@/lib/squad/validation";

export interface HighlightStatInput {
  position: Position;
  goalsTotal: number | null;
  assists: number | null;
  saves: number | null;
}

export type HighlightStatKey = "goals" | "assists" | "saves";

export interface HighlightStat {
  key: HighlightStatKey;
  value: number;
}

export function pickHighlightStats(input: HighlightStatInput): HighlightStat[] {
  const stats: HighlightStat[] = [];
  if (input.position === "GK") {
    if (input.saves) stats.push({ key: "saves", value: input.saves });
  } else {
    if (input.goalsTotal) stats.push({ key: "goals", value: input.goalsTotal });
    if (input.assists) stats.push({ key: "assists", value: input.assists });
  }
  return stats;
}
