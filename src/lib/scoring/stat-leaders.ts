// Bonus/malus "leader de journée" — moteur PUR, aucun import Prisma. Voir plan :
// pour chaque ligne de STAT_LINES, le(s) joueur(s) en tête de la journée (parmi ceux
// ayant joué) reçoivent un bonus (catégorie "bonus") ou un malus (catégorie "malus").
import { STAT_LINES } from "@/lib/stats/stat-lines";

export interface StatLeaderPlayerInput {
  playerId: string;
  played: boolean;
  goalsPlay: number | null;
  goalsPenalty: number | null;
  goalsTotal: number | null;
  shotPercentage: number | null;
  assists: number | null;
  ballsRecovered: number | null;
  opponentShotsBlocked: number | null;
  penaltiesDrawn: number | null;
  twoMinDrawn: number | null;
  neutralizations: number | null;
  turnovers: number | null;
  twoMinTaken: number | null;
  disqualified: number | null;
}

export interface StatLeaderConfig {
  enabled: boolean;
  bonusPoints: number;
  malusPoints: number; // magnitude positive — appliqué en négatif pour les catégories "malus"
}

/**
 * Calcule le bonus/malus "leader de journée" par joueur. Une catégorie est ignorée
 * si son maximum est <= 0 (pas de leader significatif — évite de récompenser/pénaliser
 * un groupe de joueurs tous à 0). Tous les joueurs à égalité sur le max reçoivent le
 * bonus/malus ; un joueur peut cumuler plusieurs lignes le même jour.
 */
export function computeStatLeaderBonuses(
  rows: StatLeaderPlayerInput[],
  config: StatLeaderConfig
): Map<string, number> {
  const bonuses = new Map<string, number>();
  if (!config.enabled) return bonuses;

  const eligible = rows.filter((r) => r.played);

  for (const line of STAT_LINES) {
    const key = line.key as keyof StatLeaderPlayerInput;
    let max = -Infinity;
    for (const row of eligible) {
      const value = row[key];
      if (value === null || typeof value !== "number") continue;
      if (value > max) max = value;
    }
    if (max <= 0 || max === -Infinity) continue;

    const delta = line.category === "bonus" ? config.bonusPoints : -config.malusPoints;
    for (const row of eligible) {
      if (row[key] === max) {
        bonuses.set(row.playerId, (bonuses.get(row.playerId) ?? 0) + delta);
      }
    }
  }

  return bonuses;
}
