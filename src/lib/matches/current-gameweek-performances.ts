// "Meilleures perfs so far" de la journée EN COURS — top joueurs par points
// fantasy sur les matchs déjà joués de la journée, sans attendre qu'elle soit
// notée. Affiché dans la bande « journée en cours » de la home (mode Starligue).
//
// Distinct de getPerformancesCard (src/lib/news/get-weekly-cards.ts) qui lit une
// actu générée APRÈS la clôture de la journée. Ici c'est calculé à la volée depuis
// PlayerMatchStat, partiel par nature.
import { prisma } from "@/lib/db";
import { computeBestPerformances } from "@/lib/players/compute-best-performances";
import type { PerformancesCardData } from "@/lib/news/get-weekly-cards";
import type { Position } from "@/lib/squad/validation";

export async function getCurrentGameweekPerformances(
  seasonId: string,
  now: Date = new Date(),
  limit = 5
): Promise<PerformancesCardData | null> {
  const gameweek = await prisma.gameweek.findFirst({
    where: { seasonId, deadlineAt: { lte: now }, confirmedAt: null },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  if (!gameweek) return null;

  // Au moins un match de la journée doit avoir des notes, sinon rien à classer.
  const hasStats = await prisma.playerMatchStat.findFirst({
    where: { match: { gameweekId: gameweek.id } },
    select: { id: true },
  });
  if (!hasStats) return null;

  const perfs = await computeBestPerformances(gameweek.id, limit);
  if (perfs.length === 0) return null;

  const players = await prisma.player.findMany({
    where: { id: { in: perfs.map((p) => p.playerId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      photoUrl: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  const entries = perfs
    .map((e) => {
      const p = byId.get(e.playerId);
      if (!p) return null;
      return {
        playerId: e.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position as Position,
        photoUrl: p.photoUrl,
        club: p.club,
        points: e.points,
        lnhRating: e.lnhRating,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { gameweekNumber: gameweek.number, entries };
}
