// Écriture des snapshots ClubStanding — upsert par (seasonId, gameweekNumber,
// clubId), jamais de create nu (CLAUDE.md). Rejouable sans risque : re-snapshoter la
// même journée met juste à jour la même ligne plutôt que d'en créer une nouvelle.
import { prisma } from "@/lib/db";
import type { DataSource } from "@prisma/client";
import type { ComputedClubStanding } from "./compute";

export async function snapshotClubStandings(
  seasonId: string,
  gameweekNumber: number,
  rows: ComputedClubStanding[],
  source: DataSource
): Promise<number> {
  if (rows.length === 0) return 0;

  await prisma.$transaction(
    rows.map((r) =>
      prisma.clubStanding.upsert({
        where: { seasonId_gameweekNumber_clubId: { seasonId, gameweekNumber, clubId: r.clubId } },
        create: {
          seasonId,
          gameweekNumber,
          clubId: r.clubId,
          rank: r.rank,
          points: r.points,
          played: r.played,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalAvg: r.goalAvg,
          source,
        },
        update: {
          rank: r.rank,
          points: r.points,
          played: r.played,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalAvg: r.goalAvg,
          source,
        },
      })
    )
  );

  return rows.length;
}
