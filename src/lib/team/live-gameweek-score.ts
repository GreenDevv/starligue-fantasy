// Score PROVISOIRE de la journée en cours — points bruts dès qu'un match a ses
// notes, sans attendre que toute la journée soit notée (§24 : le récap de journée,
// lui, reste réservé à la fin de journée). ARCHITECTURE.md §24.4.
//
// « En cours » = la dernière journée pour laquelle l'équipe a un alignement
// snapshoté (FantasyLineup / SimulationLineup) mais pas encore de points. On
// n'affiche rien tant qu'aucun match de cette journée n'a de résultat.
//
// Le total provisoire n'inclut PAS : le bonus/malus « leader de journée »
// (src/lib/scoring/stat-leaders.ts, calcul sur toute la journée), le multiplicateur
// de pronostics (§14, nécessite tous les matchs pronostiqués résolus), ni le bonus
// de victoire d'un match encore en cours (teamWon connu seulement au coup de
// sifflet final). Ces éléments s'ajoutent au scoring définitif (computeGameweekScores).
import { prisma } from "@/lib/db";
import type { SeasonMode } from "@/lib/team/active-team-context";
import { getGameweekLineupDetail, type LineupPlayerDetail } from "@/lib/team/gameweek-lineup-detail";

export interface LiveGameweekScore {
  gameweekId: string;
  gameweekNumber: number;
  matchesWithResults: number;
  matchesTotal: number;
  provisionalTotal: number;
  players: LineupPlayerDetail[]; // titulaires d'abord, puis banc
}

export async function getLiveGameweekScore(
  mode: SeasonMode,
  teamId: string
): Promise<LiveGameweekScore | null> {
  const pendingLineup =
    mode === "simulation"
      ? await prisma.simulationLineup.findFirst({
          where: { simulationTeamId: teamId, points: null },
          orderBy: { gameweek: { number: "desc" } },
          select: { gameweekId: true, gameweek: { select: { number: true } } },
        })
      : await prisma.fantasyLineup.findFirst({
          where: { fantasyTeamId: teamId, points: null, gameweek: { isScored: false } },
          orderBy: { gameweek: { number: "desc" } },
          select: { gameweekId: true, gameweek: { select: { number: true } } },
        });

  if (!pendingLineup) return null;

  const gameweekId = pendingLineup.gameweekId;

  const matches = await prisma.match.findMany({
    where: { gameweekId },
    select: { id: true, status: true, playerStats: { select: { id: true }, take: 1 } },
  });
  if (matches.length === 0) return null;

  const matchesWithResults = matches.filter((m) => m.playerStats.length > 0).length;
  if (matchesWithResults === 0) return null;

  const detail = await getGameweekLineupDetail(mode, teamId, gameweekId, { includePartialStats: true });
  if (!detail) return null;

  const provisionalTotal =
    Math.round(detail.players.reduce((sum, p) => sum + (p.points ?? 0), 0) * 10) / 10;

  return {
    gameweekId,
    gameweekNumber: detail.gameweekNumber,
    matchesWithResults,
    matchesTotal: matches.length,
    provisionalTotal,
    players: detail.players,
  };
}
