// Orchestration des 2 actus générées après le scoring d'une journée (équipe type +
// meilleures perfs) — déclenché depuis POST /api/cron/compute-scores juste après un
// computeGameweekScores réussi (déjà live-only via le filtre season.isActive des
// candidats de ce cron). Idempotent via upsert sur dedupeKey : un recompute (admin
// recompute/:gameweekId) réécrit juste les mêmes lignes, jamais de doublon.
//
// La rédaction (titre/chapo/corps) est déléguée aux fonctions pures de
// weekly-news-copy.ts ; ici on ne fait que résoudre les identités joueur et upsert.
import { prisma } from "@/lib/db";
import { computeGameweekBestXI } from "@/lib/players/compute-gameweek-best-xi";
import { computeBestPerformances } from "@/lib/players/compute-best-performances";
import type { Position } from "@/lib/squad/validation";
import type { TeamOfWeekPayload, PerformancesPayload } from "./payload";
import { teamOfWeekCopy, performancesCopy } from "./weekly-news-copy";

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
    const copy = teamOfWeekCopy({
      gameweekNumber,
      entries: bestXI.map((e) => ({
        position: e.position as Position,
        firstName: e.firstName,
        lastName: e.lastName,
        clubShortName: e.club.shortName,
        points: e.points,
      })),
    });
    await prisma.newsItem.upsert({
      where: { dedupeKey: `team-of-week:${gameweekId}` },
      create: {
        seasonId,
        category: "TEAM_OF_WEEK",
        sourceType: "GENERATED",
        sourceKey: "system",
        title: copy.title,
        excerpt: copy.excerpt,
        content: copy.content,
        publishedAt: new Date(),
        dedupeKey: `team-of-week:${gameweekId}`,
        payload,
      },
      update: { payload, title: copy.title, excerpt: copy.excerpt, content: copy.content },
    });
  }

  if (performances.length > 0) {
    const players = await prisma.player.findMany({
      where: { id: { in: performances.map((e) => e.playerId) } },
      select: { id: true, firstName: true, lastName: true, club: { select: { shortName: true } } },
    });
    const byId = new Map(players.map((p) => [p.id, p]));

    const payload: PerformancesPayload = {
      gameweekNumber,
      entries: performances.map((e) => ({ playerId: e.playerId, points: e.points, lnhRating: e.lnhRating })),
    };
    const copy = performancesCopy({
      gameweekNumber,
      entries: performances.map((e) => {
        const p = byId.get(e.playerId);
        return {
          firstName: p?.firstName ?? "",
          lastName: p?.lastName ?? "",
          clubShortName: p?.club.shortName ?? "",
          points: e.points,
          lnhRating: e.lnhRating,
        };
      }),
    });
    await prisma.newsItem.upsert({
      where: { dedupeKey: `performance:${gameweekId}` },
      create: {
        seasonId,
        category: "PERFORMANCE",
        sourceType: "GENERATED",
        sourceKey: "system",
        title: copy.title,
        excerpt: copy.excerpt,
        content: copy.content,
        publishedAt: new Date(),
        dedupeKey: `performance:${gameweekId}`,
        payload,
      },
      update: { payload, title: copy.title, excerpt: copy.excerpt, content: copy.content },
    });
  }
}
