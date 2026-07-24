// Orchestration des 2 actus générées après le scoring d'une journée (équipe type +
// meilleures perfs) — déclenché depuis POST /api/cron/compute-scores juste après un
// computeGameweekScores réussi (déjà live-only via le filtre season.isActive des
// candidats de ce cron). Idempotent via upsert sur dedupeKey : un recompute (admin
// recompute/:gameweekId) réécrit juste les 2 mêmes lignes, jamais de doublon.
import { prisma } from "@/lib/db";
import { computeGameweekBestXI } from "@/lib/players/compute-gameweek-best-xi";
import { computeBestPerformances } from "@/lib/players/compute-best-performances";
import type { TeamOfWeekPayload, PerformancesPayload } from "./payload";

export async function generateWeeklyNews(seasonId: string, gameweekId: string, gameweekNumber: number): Promise<void> {
  const [bestXI, performances] = await Promise.all([
    computeGameweekBestXI(gameweekId),
    computeBestPerformances(gameweekId, 5),
  ]);

  if (bestXI.length > 0) {
    const payload: TeamOfWeekPayload = {
      gameweekNumber,
      entries: bestXI.map((e) => ({ position: e.position, playerId: e.playerId, points: e.points })),
    };
    await prisma.newsItem.upsert({
      where: { dedupeKey: `team-of-week:${gameweekId}` },
      create: {
        seasonId,
        category: "TEAM_OF_WEEK",
        sourceType: "GENERATED",
        sourceKey: "system",
        title: `Équipe type de la journée ${gameweekNumber}`,
        publishedAt: new Date(),
        dedupeKey: `team-of-week:${gameweekId}`,
        payload,
      },
      update: { payload, title: `Équipe type de la journée ${gameweekNumber}` },
    });
  }

  if (performances.length > 0) {
    const payload: PerformancesPayload = {
      gameweekNumber,
      entries: performances.map((e) => ({ playerId: e.playerId, points: e.points, lnhRating: e.lnhRating })),
    };
    await prisma.newsItem.upsert({
      where: { dedupeKey: `performance:${gameweekId}` },
      create: {
        seasonId,
        category: "PERFORMANCE",
        sourceType: "GENERATED",
        sourceKey: "system",
        title: `Meilleures performances de la journée ${gameweekNumber}`,
        publishedAt: new Date(),
        dedupeKey: `performance:${gameweekId}`,
        payload,
      },
      update: { payload, title: `Meilleures performances de la journée ${gameweekNumber}` },
    });
  }
}
