// "Meilleures notes de la journée" — les joueurs les mieux notés par la LNH sur
// les matchs déjà joués de la journée en cours (classement par note LNH, pas par
// points fantasy — demande utilisateur). Affiché dans la bande « journée en
// cours » de la home. Partiel par nature (ne voit que les matchs déjà notés).
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import type { PerformancesCardData } from "@/lib/news/get-weekly-cards";
import type { Position } from "@/lib/squad/validation";

export async function getCurrentGameweekPerformances(
  seasonId: string,
  now: Date = new Date(),
  limit = 6
): Promise<PerformancesCardData | null> {
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
      player: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          position: true,
          photoUrl: true,
          club: { select: { shortName: true, logoUrl: true } },
        },
      },
    },
  });
  if (stats.length === 0) return null;

  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const entries = stats.map((s) => {
    const rating = Number(s.lnhRating);
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
    };
  });

  return { gameweekNumber: gameweek.number, entries };
}
