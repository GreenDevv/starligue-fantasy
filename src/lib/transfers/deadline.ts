// Verrouillage de l'alignement (PUT lineup) — pure, testée. En live la deadline
// réelle (Gameweek.deadlineAt) verrouille dès qu'une journée est en cours et pas
// encore scorée ; en simulation aucun verrou temps réel n'existe (modifiable
// librement jusqu'à ce qu'un admin fasse avancer la journée globalement, voir
// plan de fusion live/simulation étape 6).
import type { SeasonMode } from "@/lib/team/active-team-context";

export function isLineupEditLocked(mode: SeasonMode, hasActiveUnscoredGameweek: boolean): boolean {
  if (mode === "simulation") return false;
  return hasActiveUnscoredGameweek;
}
