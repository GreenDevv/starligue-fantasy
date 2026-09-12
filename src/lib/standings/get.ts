// Lecture du classement courant — le dernier snapshot enregistré pour la saison
// (gameweekNumber max), club-joint. Utilisé par le widget dashboard (mode-aware :
// même fonction pour la saison live et la saison de simulation, seul seasonId change).
// Si des matchs sont actuellement LIVE, le snapshot est complété par une projection
// en direct (voir live-projection.ts, ARCHITECTURE.md §24) — sans ça le classement
// n'évolue qu'une fois la LNH ayant publié le résultat officiel, jamais pendant le
// match. `liveMatchesCounted > 0` signale à l'UI qu'il s'agit d'un classement
// provisoire (pas encore l'ordre officiel LNH pour ces rencontres).
import { prisma } from "@/lib/db";
import { projectLiveStandings } from "./live-projection";

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
  // Nombre de matchs actuellement LIVE pris en compte dans `rows` par projection
  // (0 = classement officiel tel quel, pas de match en cours).
  liveMatchesCounted: number;
}

export async function getClubStandings(seasonId: string): Promise<ClubStandingsResult> {
  const latest = await prisma.clubStanding.aggregate({
    where: { seasonId },
    _max: { gameweekNumber: true },
  });
  const gameweekNumber = latest._max.gameweekNumber;
  if (gameweekNumber === null) return { gameweekNumber: null, rows: [], liveMatchesCounted: 0 };

  const standings = await prisma.clubStanding.findMany({
    where: { seasonId, gameweekNumber },
    orderBy: { rank: "asc" },
    include: { club: { select: { name: true, shortName: true, logoUrl: true } } },
  });

  const rows: ClubStandingRow[] = standings.map((s) => ({
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
  }));

  const liveMatches = await prisma.match.findMany({
    where: { seasonId, status: "LIVE", homeScore: { not: null }, awayScore: { not: null } },
    select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true },
  });
  if (liveMatches.length === 0) return { gameweekNumber, rows, liveMatchesCounted: 0 };

  const projected = projectLiveStandings(
    rows,
    liveMatches.map((m) => ({
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }))
  );

  return { gameweekNumber, rows: projected, liveMatchesCounted: liveMatches.length };
}
