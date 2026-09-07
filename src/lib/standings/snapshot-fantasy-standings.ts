// Snapshot du classement général fantasy à l'issue d'une journée (voir
// FantasyStandingSnapshot dans schema.prisma). Idempotent : upsert par
// (seasonId, mode, gameweekNumber, teamId), jamais de create nu — rejouable pour un
// recompute live (POST /api/admin/recompute) ou une ré-avancée simulation.
//
// Le cumul est recalculé par journée (Σ des lineups jusqu'à `gameweekNumber` inclus
// − pointsConverted), donc correct même quand on (re)score une journée passée alors
// que des journées ultérieures existent déjà.
//
// `pointsConverted` est pris à sa valeur COURANTE (l'historique daté des
// conversions points → budget n'est pas reconstituable par journée). Écart
// négligeable pour une évolution de rang, les conversions restant rares ; même
// approximation dans scripts/backfill-fantasy-standing-snapshots.ts.
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import type { SeasonMode } from "@prisma/client";
import { rankTeams, type RankableTeam } from "./fantasy-rank";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function gatherLiveTeams(seasonId: string, gameweekNumber: number): Promise<RankableTeam[]> {
  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true, league: { seasonId } },
    select: {
      id: true,
      leagueId: true,
      pointsConverted: true,
      lineups: {
        where: { points: { not: null }, gameweek: { number: { lte: gameweekNumber } } },
        select: { points: true },
      },
    },
  });
  return teams.map((t) => {
    const raw = t.lineups.reduce((s, l) => s + Number(l.points ?? 0), 0);
    return { teamId: t.id, leagueId: t.leagueId, cumulativePoints: round1(raw - Number(t.pointsConverted)) };
  });
}

async function gatherSimulationTeams(seasonId: string, gameweekNumber: number): Promise<RankableTeam[]> {
  const teams = await prisma.simulationTeam.findMany({
    where: { isValidated: true, seasonId },
    select: {
      id: true,
      leagueId: true,
      pointsConverted: true,
      lineups: {
        where: { points: { not: null }, gameweek: { number: { lte: gameweekNumber } } },
        select: { points: true },
      },
    },
  });
  return teams.map((t) => {
    const raw = t.lineups.reduce((s, l) => s + Number(l.points ?? 0), 0);
    return { teamId: t.id, leagueId: t.leagueId, cumulativePoints: round1(raw - Number(t.pointsConverted)) };
  });
}

export async function snapshotFantasyStandings(
  seasonId: string,
  gameweekNumber: number,
  mode: SeasonMode
): Promise<{ count: number }> {
  const teams =
    mode === "LIVE"
      ? await gatherLiveTeams(seasonId, gameweekNumber)
      : await gatherSimulationTeams(seasonId, gameweekNumber);

  if (teams.length === 0) return { count: 0 };

  const ranked = rankTeams(teams);

  await prisma.$transaction(
    ranked.map((r) =>
      prisma.fantasyStandingSnapshot.upsert({
        where: {
          seasonId_mode_gameweekNumber_teamId: { seasonId, mode, gameweekNumber, teamId: r.teamId },
        },
        create: {
          seasonId,
          mode,
          gameweekNumber,
          teamId: r.teamId,
          leagueId: r.leagueId,
          globalRank: r.globalRank,
          leagueRank: r.leagueRank,
          cumulativePoints: new Decimal(r.cumulativePoints),
        },
        update: {
          leagueId: r.leagueId,
          globalRank: r.globalRank,
          leagueRank: r.leagueRank,
          cumulativePoints: new Decimal(r.cumulativePoints),
          capturedAt: new Date(),
        },
      })
    )
  );

  return { count: ranked.length };
}
