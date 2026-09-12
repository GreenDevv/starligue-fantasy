// "Meilleures perfs en direct" — les joueurs les mieux notés par la LNH sur les
// matchs déjà joués de la journée en cours (classement par note LNH, pas par
// points fantasy — demande utilisateur). Affiché dans LivePerformancesCard
// (bande « journée en cours » de la home, ARCHITECTURE.md §32). Partiel par
// nature (ne voit que les matchs déjà notés) — type dédié, distinct de
// PerformancesCardData (src/lib/news/get-weekly-cards.ts, carte "dernière
// journée notée" éditoriale, non concernée par cet enrichissement).
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import type { Position } from "@/lib/squad/validation";

export interface LiveGameweekPerformanceEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  club: { shortName: string; logoUrl: string | null };
  points: number;
  lnhRating: number;
  goalsTotal: number | null;
  assists: number | null;
  saves: number | null;
  match: {
    id: string;
    opponentClub: { shortName: string; logoUrl: string | null };
    isHome: boolean;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  };
}

export interface LiveGameweekPerformances {
  gameweekNumber: number;
  entries: LiveGameweekPerformanceEntry[];
}

// limit=7 : le leader + 6 dans la grille de LivePerformancesCard remplit
// exactement les 2 lignes de la grille md (grid-cols-4, leader sur 2
// colonnes) — 2 entrées sur la 1ʳᵉ ligne + 4 sur la 2ᵉ, sans case vide.
export async function getCurrentGameweekPerformances(
  seasonId: string,
  now: Date = new Date(),
  limit = 7
): Promise<LiveGameweekPerformances | null> {
  const gameweek = await prisma.gameweek.findFirst({
    where: { seasonId, deadlineAt: { lte: now }, confirmedAt: null },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  if (!gameweek) return null;

  const stats = await prisma.playerMatchStat.findMany({
    where: {
      match: { gameweekId: gameweek.id },
      played: true,
      lnhRating: { not: null },
    },
    orderBy: { lnhRating: "desc" },
    take: limit,
    select: {
      lnhRating: true,
      goalsTotal: true,
      assists: true,
      saves: true,
      player: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          position: true,
          photoUrl: true,
          clubId: true,
          club: { select: { shortName: true, logoUrl: true } },
        },
      },
      match: {
        select: {
          id: true,
          status: true,
          homeScore: true,
          awayScore: true,
          homeClubId: true,
          awayClubId: true,
          homeClub: { select: { shortName: true, logoUrl: true } },
          awayClub: { select: { shortName: true, logoUrl: true } },
        },
      },
    },
  });
  if (stats.length === 0) return null;

  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const entries: LiveGameweekPerformanceEntry[] = stats.map((s) => {
    const rating = Number(s.lnhRating);
    const isHome = s.player.clubId === s.match.homeClubId;
    return {
      playerId: s.player.id,
      firstName: s.player.firstName,
      lastName: s.player.lastName,
      position: s.player.position as Position,
      photoUrl: s.player.photoUrl,
      club: s.player.club,
      // Points fantasy que cette ligne rapporte à un titulaire (formule §2.3).
      points: computePlayerPoints(
        { lnhRating: rating, played: true, role: "STARTER", teamWon: false },
        scoringConfig
      ),
      lnhRating: rating,
      goalsTotal: s.goalsTotal,
      assists: s.assists,
      saves: s.saves,
      match: {
        id: s.match.id,
        opponentClub: isHome ? s.match.awayClub : s.match.homeClub,
        isHome,
        homeScore: s.match.homeScore,
        awayScore: s.match.awayScore,
        status: s.match.status,
      },
    };
  });

  return { gameweekNumber: gameweek.number, entries };
}
