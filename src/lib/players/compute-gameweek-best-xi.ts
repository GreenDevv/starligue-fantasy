// "Équipe type de la semaine" — même moteur que computeSeasonPlayerPoints
// (compute-best-xi.ts) mais scopé à UNE SEULE Gameweek au lieu de la saison cumulée.
// Consommé par src/lib/news/generate-weekly-news.ts pour produire l'actu TEAM_OF_WEEK
// de la page publique /starligue (saison live uniquement, cf. le déclencheur dans
// POST /api/cron/compute-scores qui ne considère que season.isActive).
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "@/lib/scoring/stat-leaders";
import { pickBestXI, type SeasonPlayerPoints } from "./best-xi";
import type { Position } from "@/lib/squad/validation";
import type { BestXIEntry } from "./compute-best-xi";

export async function computeGameweekPlayerPoints(gameweekId: string): Promise<Map<string, number>> {
  const gameweek = await prisma.gameweek.findUnique({
    where: { id: gameweekId },
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
  if (!gameweek) return new Map();

  const playerIds = gameweek.matches.flatMap((m) => m.playerStats.map((s) => s.playerId));
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, clubId: true },
  });
  const clubIdByPlayer = new Map(players.map((p) => [p.id, p.clubId]));

  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const statLeaderRows: StatLeaderPlayerInput[] = gameweek.matches.flatMap((match) =>
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

  const totals = new Map<string, number>();

  for (const match of gameweek.matches) {
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

      totals.set(stat.playerId, Math.round(points * 10) / 10);
    }
  }

  return totals;
}

/** Jusqu'à 7 entrées (1/poste) — poste omis si aucun joueur noté cette journée-là. */
export async function computeGameweekBestXI(gameweekId: string): Promise<BestXIEntry[]> {
  const totals = await computeGameweekPlayerPoints(gameweekId);
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
