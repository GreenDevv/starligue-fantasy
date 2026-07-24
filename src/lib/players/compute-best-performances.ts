// "Meilleures performances de la semaine" — classement des joueurs par points
// fantasy sur UNE Gameweek, sans contrainte de poste (contrairement à l'équipe type,
// compute-gameweek-best-xi.ts). Consommé par src/lib/news/generate-weekly-news.ts.
import { prisma } from "@/lib/db";
import { computeGameweekPlayerPoints } from "./compute-gameweek-best-xi";

export interface GameweekPerformanceEntry {
  playerId: string;
  points: number;
  lnhRating: number | null;
}

/** Pure : trie et tronque une map de points déjà calculée — testable sans Prisma. */
export function rankTopPerformances(
  totals: Map<string, number>,
  ratingByPlayer: Map<string, number | null>,
  limit: number
): GameweekPerformanceEntry[] {
  return Array.from(totals.entries())
    .map(([playerId, points]) => ({ playerId, points, lnhRating: ratingByPlayer.get(playerId) ?? null }))
    .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

export async function computeBestPerformances(
  gameweekId: string,
  limit = 5
): Promise<GameweekPerformanceEntry[]> {
  const totals = await computeGameweekPlayerPoints(gameweekId);
  if (totals.size === 0) return [];

  const stats = await prisma.playerMatchStat.findMany({
    where: { playerId: { in: Array.from(totals.keys()) }, match: { gameweekId } },
    select: { playerId: true, lnhRating: true },
  });
  const ratingByPlayer = new Map(stats.map((s) => [s.playerId, s.lnhRating !== null ? Number(s.lnhRating) : null]));

  return rankTopPerformances(totals, ratingByPlayer, limit);
}
