// Calcule et snapshote le classement des clubs pour la saison de simulation —
// depuis Match (déjà importé en entier au setup, cf. src/lib/simulation/setup.ts),
// mais filtré aux journées <= curseur pour ne jamais dévoiler des résultats que
// l'utilisateur n'a pas encore "découverts" en avançant (même règle que
// getSimulationDashboardMatchStrips, src/lib/matches/dashboard-strips.ts). Appelé à
// chaque avancée admin (src/lib/simulation/admin-advance.ts).
import { prisma } from "@/lib/db";
import { computeClubStandings } from "./compute";
import { snapshotClubStandings } from "./snapshot";

export interface SimulationStandingsSyncResult {
  gameweekNumber: number;
  clubs: number;
  matchesCounted: number;
  upserted: number;
}

export async function computeAndSnapshotSimulationStandings(
  seasonId: string,
  uptoGameweekNumber: number
): Promise<SimulationStandingsSyncResult> {
  const matches = await prisma.match.findMany({
    where: { seasonId },
    select: {
      homeClubId: true,
      awayClubId: true,
      homeScore: true,
      awayScore: true,
      status: true,
      gameweek: { select: { number: true } },
      homeClub: { select: { id: true, name: true } },
      awayClub: { select: { id: true, name: true } },
    },
  });

  const clubsById = new Map<string, { id: string; name: string }>();
  for (const m of matches) {
    clubsById.set(m.homeClub.id, m.homeClub);
    clubsById.set(m.awayClub.id, m.awayClub);
  }

  const finishedUpToCursor = matches.filter(
    (m): m is typeof m & { homeScore: number; awayScore: number } =>
      m.status === "FINISHED" &&
      m.gameweek.number <= uptoGameweekNumber &&
      m.homeScore !== null &&
      m.awayScore !== null
  );

  const rows = computeClubStandings(
    [...clubsById.values()],
    finishedUpToCursor.map((m) => ({
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }))
  );

  const upserted = await snapshotClubStandings(seasonId, uptoGameweekNumber, rows, "LNH_SCRAPER");

  return {
    gameweekNumber: uptoGameweekNumber,
    clubs: clubsById.size,
    matchesCounted: finishedUpToCursor.length,
    upserted,
  };
}
