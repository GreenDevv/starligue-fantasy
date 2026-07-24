// Points fantasy cumulés par vrai joueur depuis le début de saison, et sélection de
// "l'équipe type" qui en découle — orchestration Prisma autour du cœur pur
// pickBestXI (src/lib/players/best-xi.ts). Lecture parallèle à computeGameweekScores
// (src/lib/scoring/compute.ts) : même moteur de points (computePlayerPoints,
// computeStatLeaderBonuses), mais indépendante de toute FantasyLineup — un joueur
// qu'aucun utilisateur n'a recruté compte quand même. On ne touche pas à compute.ts
// (chemin critique déjà testé), cette lecture reconstruit sa propre résolution
// teamWon/notes à partir de PlayerMatchStat, pour les seules journées déjà scorées.
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "@/lib/scoring/stat-leaders";
import { pickBestXI, type SeasonPlayerPoints } from "./best-xi";
import type { Position } from "@/lib/squad/validation";

export async function computeSeasonPlayerPoints(seasonId: string): Promise<Map<string, number>> {
  const players = await prisma.player.findMany({
    where: { seasonId },
    select: { id: true, clubId: true },
  });
  const clubIdByPlayer = new Map(players.map((p) => [p.id, p.clubId]));

  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId, isScored: true },
    select: {
      matches: {
        select: {
          homeClubId: true,
          awayClubId: true,
          homeScore: true,
          awayScore: true,
          playerStats: true,
        },
      },
    },
  });

  const totals = new Map<string, number>();

  for (const gw of gameweeks) {
    const statLeaderRows: StatLeaderPlayerInput[] = gw.matches.flatMap((match) =>
      match.playerStats.map((stat) => ({
        playerId: stat.playerId,
        played: stat.played,
        goalsPlay: stat.goalsPlay,
        goalsPenalty: stat.goalsPenalty,
        goalsTotal: stat.goalsTotal,
        shotPercentage: stat.shotPercentage !== null ? Number(stat.shotPercentage) : null,
        assists: stat.assists,
        ballsRecovered: stat.ballsRecovered,
        opponentShotsBlocked: stat.opponentShotsBlocked,
        penaltiesDrawn: stat.penaltiesDrawn,
        twoMinDrawn: stat.twoMinDrawn,
        neutralizations: stat.neutralizations,
        turnovers: stat.turnovers,
        twoMinTaken: stat.twoMinTaken,
        disqualified: stat.disqualified,
      }))
    );
    const statBonusByPlayer = computeStatLeaderBonuses(statLeaderRows, {
      enabled: scoringConfig.statLeaderBonusEnabled,
      bonusPoints: scoringConfig.statLeaderBonusPoints,
      malusPoints: scoringConfig.statLeaderMalusPoints,
    });

    for (const match of gw.matches) {
      const homeWon = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
      const awayWon = match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

      for (const stat of match.playerStats) {
        const clubId = clubIdByPlayer.get(stat.playerId);
        const teamWon = clubId === match.homeClubId ? homeWon : clubId === match.awayClubId ? awayWon : false;

        const points = computePlayerPoints(
          {
            lnhRating: stat.lnhRating !== null ? Number(stat.lnhRating) : null,
            played: stat.played,
            role: "STARTER",
            teamWon,
            isCaptain: false,
            statBonusPoints: statBonusByPlayer.get(stat.playerId) ?? 0,
          },
          scoringConfig
        );

        totals.set(stat.playerId, Math.round(((totals.get(stat.playerId) ?? 0) + points) * 10) / 10);
      }
    }
  }

  return totals;
}

export interface BestXIEntry {
  position: Position;
  playerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  club: { shortName: string; logoUrl: string | null };
  points: number;
}

/** Jusqu'à 7 entrées (1/poste) — poste omis si aucun joueur noté sur la saison. */
export async function computeBestXI(seasonId: string): Promise<BestXIEntry[]> {
  const totals = await computeSeasonPlayerPoints(seasonId);
  if (totals.size === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: Array.from(totals.keys()) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      photoUrl: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });

  const entries: SeasonPlayerPoints[] = players.map((p) => ({
    playerId: p.id,
    position: p.position as Position,
    points: totals.get(p.id) ?? 0,
  }));

  const bestByPosition = pickBestXI(entries);
  const playerById = new Map(players.map((p) => [p.id, p]));

  const result: BestXIEntry[] = [];
  for (const [position, playerId] of bestByPosition) {
    const p = playerById.get(playerId);
    if (!p) continue;
    result.push({
      position,
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: p.photoUrl,
      club: p.club,
      points: totals.get(playerId) ?? 0,
    });
  }
  return result;
}
