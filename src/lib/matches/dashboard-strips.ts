// Résout les matchs "résultats de la dernière journée" et "prochains matchs" pour le
// dashboard /team et /simulation (src/components/dashboard/MatchesStrip.tsx).
// Requêtes Prisma directes (server-only), même convention que team/page.tsx et
// simulation/page.tsx — pas de route API dédiée, réutilisé par les deux pages.
import { prisma } from "@/lib/db";

const CLUB_SELECT = { select: { id: true, shortName: true, name: true, logoUrl: true } } as const;

export interface DashboardStripMatch {
  id: string;
  homeClub: { id: string; shortName: string; name: string; logoUrl: string | null };
  awayClub: { id: string; shortName: string; name: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: Date;
}

export interface DashboardStrips {
  lastResults: { gameweekNumber: number | null; matches: DashboardStripMatch[] };
  upcoming: { gameweekNumber: number | null; matches: DashboardStripMatch[] };
}

async function getMatchesForGameweekNumber(
  seasonId: string,
  number: number | null
): Promise<{ gameweekNumber: number | null; matches: DashboardStripMatch[] }> {
  if (number === null || number < 1) return { gameweekNumber: null, matches: [] };
  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId, number } },
    include: { matches: { include: { homeClub: CLUB_SELECT, awayClub: CLUB_SELECT }, orderBy: { kickoffAt: "asc" } } },
  });
  return { gameweekNumber: gameweek?.number ?? null, matches: gameweek?.matches ?? [] };
}

/**
 * Mode Simulation : contrairement au direct, `deadlineAt`/`status` sont des dates
 * déjà passées pour toute la saison (le calendrier réel 2025/26 est importé en
 * entier dès le setup, cf. src/lib/simulation/setup.ts) — la notion de "dernière
 * journée"/"prochains matchs" ne peut donc pas se déduire de l'horloge, mais de la
 * progression propre à CETTE équipe (`currentGameweekNumber`, l'avancée journée par
 * journée). On ne montre les scores que de la dernière journée déjà avancée, jamais
 * au-delà — pour ne pas spoiler des résultats réels que l'utilisateur n'a pas encore
 * "découverts" en avançant.
 */
export async function getSimulationDashboardMatchStrips(
  seasonId: string,
  currentGameweekNumber: number
): Promise<DashboardStrips> {
  const [lastResults, upcoming] = await Promise.all([
    getMatchesForGameweekNumber(seasonId, currentGameweekNumber > 0 ? currentGameweekNumber : null),
    getMatchesForGameweekNumber(seasonId, currentGameweekNumber + 1),
  ]);
  return { lastResults, upcoming };
}

export async function getDashboardMatchStrips(seasonId: string): Promise<DashboardStrips> {
  const [lastFinishedGameweek, upcomingGameweek] = await Promise.all([
    prisma.gameweek.findFirst({
      where: { seasonId, matches: { some: { status: "FINISHED" } } },
      orderBy: { number: "desc" },
      include: { matches: { include: { homeClub: CLUB_SELECT, awayClub: CLUB_SELECT }, orderBy: { kickoffAt: "asc" } } },
    }),
    prisma.gameweek.findFirst({
      where: { seasonId, deadlineAt: { gt: new Date() } },
      orderBy: { number: "asc" },
      include: { matches: { include: { homeClub: CLUB_SELECT, awayClub: CLUB_SELECT }, orderBy: { kickoffAt: "asc" } } },
    }),
  ]);

  return {
    lastResults: {
      gameweekNumber: lastFinishedGameweek?.number ?? null,
      matches: lastFinishedGameweek?.matches.filter((m) => m.status === "FINISHED") ?? [],
    },
    upcoming: {
      gameweekNumber: upcomingGameweek?.number ?? null,
      matches: upcomingGameweek?.matches ?? [],
    },
  };
}
