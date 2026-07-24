// Sélection de "l'équipe type" (1 meilleur joueur par poste, sur ses points fantasy
// cumulés depuis le début de saison) — fonction PURE, aucun import Prisma. Les points
// sont fournis par l'appelant (src/lib/players/compute-best-xi.ts, orchestration
// Prisma) : indépendant de toute équipe fantasy existante, un joueur qu'aucun
// utilisateur n'a recruté compte quand même.

import type { Position } from "@/lib/squad/validation";

export interface SeasonPlayerPoints {
  playerId: string;
  position: Position;
  points: number;
}

/**
 * Groupe par poste, garde le joueur au plus haut total de points. Un poste sans
 * aucun joueur noté est absent du résultat (normal en tout début de saison). Égalité
 * de points : tie-break déterministe sur playerId (ordre alphabétique) pour un
 * résultat stable et testable.
 */
export function pickBestXI(entries: SeasonPlayerPoints[]): Map<Position, string> {
  const bestByPosition = new Map<Position, SeasonPlayerPoints>();

  for (const entry of entries) {
    const current = bestByPosition.get(entry.position);
    if (
      !current ||
      entry.points > current.points ||
      (entry.points === current.points && entry.playerId < current.playerId)
    ) {
      bestByPosition.set(entry.position, entry);
    }
  }

  const result = new Map<Position, string>();
  for (const [position, entry] of bestByPosition) {
    result.set(position, entry.playerId);
  }
  return result;
}
