// Lecture du classement courant — le dernier snapshot enregistré pour la saison
// (gameweekNumber max), club-joint. Utilisé par le widget dashboard (mode-aware :
// même fonction pour la saison live et la saison de simulation, seul seasonId change).
import { prisma } from "@/lib/db";

export interface ClubStandingRow {
  clubId: string;
  clubName: string;
  clubShortName: string;
  logoUrl: string | null;
  rank: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalAvg: number;
}

export interface ClubStandingsResult {
  gameweekNumber: number | null; // null = aucun snapshot encore enregistré
  rows: ClubStandingRow[];
}

export async function getClubStandings(seasonId: string): Promise<ClubStandingsResult> {
  const latest = await prisma.clubStanding.aggregate({
    where: { seasonId },
    _max: { gameweekNumber: true },
  });
  const gameweekNumber = latest._max.gameweekNumber;
  if (gameweekNumber === null) return { gameweekNumber: null, rows: [] };

  const standings = await prisma.clubStanding.findMany({
    where: { seasonId, gameweekNumber },
    orderBy: { rank: "asc" },
    include: { club: { select: { name: true, shortName: true, logoUrl: true } } },
  });

  return {
    gameweekNumber,
    rows: standings.map((s) => ({
      clubId: s.clubId,
      clubName: s.club.name,
      clubShortName: s.club.shortName,
      logoUrl: s.club.logoUrl,
      rank: s.rank,
      points: s.points,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalAvg: s.goalAvg,
    })),
  };
}
