// Lecture de l'évolution du rang d'une équipe pour une journée donnée — depuis les
// snapshots FantasyStandingSnapshot (voir snapshot-fantasy-standings.ts). Utilisé
// par le récap de journée enrichi (évolution ▲/▼ du classement général et de ligue).
import { prisma } from "@/lib/db";
import type { SeasonMode } from "@prisma/client";
import { rankDelta } from "./fantasy-rank";

export interface RankMovement {
  globalRank: number;
  leagueRank: number;
  // + = places gagnées depuis la journée précédente notée ; null si aucun snapshot
  // antérieur (1ʳᵉ journée de l'équipe, ou équipe validée en cours de saison).
  globalDelta: number | null;
  leagueDelta: number | null;
  totalTeams: number; // nb d'équipes classées globalement à cette journée
  previousGameweekNumber: number | null;
}

export async function getRankMovement(
  seasonId: string,
  mode: SeasonMode,
  teamId: string,
  gameweekNumber: number
): Promise<RankMovement | null> {
  const current = await prisma.fantasyStandingSnapshot.findUnique({
    where: { seasonId_mode_gameweekNumber_teamId: { seasonId, mode, gameweekNumber, teamId } },
  });
  if (!current) return null;

  const [previous, totalTeams] = await Promise.all([
    prisma.fantasyStandingSnapshot.findFirst({
      where: { seasonId, mode, teamId, gameweekNumber: { lt: gameweekNumber } },
      orderBy: { gameweekNumber: "desc" },
    }),
    prisma.fantasyStandingSnapshot.count({ where: { seasonId, mode, gameweekNumber } }),
  ]);

  return {
    globalRank: current.globalRank,
    leagueRank: current.leagueRank,
    globalDelta: rankDelta(previous?.globalRank ?? null, current.globalRank),
    leagueDelta: rankDelta(previous?.leagueRank ?? null, current.leagueRank),
    totalTeams,
    previousGameweekNumber: previous?.gameweekNumber ?? null,
  };
}
