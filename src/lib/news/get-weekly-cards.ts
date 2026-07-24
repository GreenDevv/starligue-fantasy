// Résout les payloads JSON des dernières actus TEAM_OF_WEEK/PERFORMANCE (générées par
// generate-weekly-news.ts) vers des détails joueur/club à jour — le payload ne stocke
// que playerId/points (pas de nom/photo dénormalisés), donc toujours à jour même si
// la photo/le club d'un joueur change après coup.
import { prisma } from "@/lib/db";
import { TeamOfWeekPayloadSchema, PerformancesPayloadSchema } from "./payload";
import { getLatestGeneratedNews } from "./get-feed";
import type { Position } from "@/lib/squad/validation";

export interface TeamOfWeekCardData {
  gameweekNumber: number;
  entries: {
    position: Position;
    playerId: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    club: { shortName: string; logoUrl: string | null };
    points: number;
  }[];
}

export async function getTeamOfWeekCard(seasonId: string): Promise<TeamOfWeekCardData | null> {
  const newsItem = await getLatestGeneratedNews(seasonId, "TEAM_OF_WEEK");
  if (!newsItem) return null;

  const parsed = TeamOfWeekPayloadSchema.safeParse(newsItem.payload);
  if (!parsed.success || parsed.data.entries.length === 0) return null;

  const players = await prisma.player.findMany({
    where: { id: { in: parsed.data.entries.map((e) => e.playerId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  const entries = parsed.data.entries
    .map((e) => {
      const p = playerById.get(e.playerId);
      if (!p) return null;
      return {
        position: e.position as Position,
        playerId: e.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        photoUrl: p.photoUrl,
        club: p.club,
        points: e.points,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { gameweekNumber: parsed.data.gameweekNumber, entries };
}

export interface PerformancesCardData {
  gameweekNumber: number;
  entries: {
    playerId: string;
    firstName: string;
    lastName: string;
    position: Position;
    photoUrl: string | null;
    club: { shortName: string; logoUrl: string | null };
    points: number;
    lnhRating: number | null;
  }[];
}

export async function getPerformancesCard(seasonId: string): Promise<PerformancesCardData | null> {
  const newsItem = await getLatestGeneratedNews(seasonId, "PERFORMANCE");
  if (!newsItem) return null;

  const parsed = PerformancesPayloadSchema.safeParse(newsItem.payload);
  if (!parsed.success || parsed.data.entries.length === 0) return null;

  const players = await prisma.player.findMany({
    where: { id: { in: parsed.data.entries.map((e) => e.playerId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      photoUrl: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  const entries = parsed.data.entries
    .map((e) => {
      const p = playerById.get(e.playerId);
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

  return { gameweekNumber: parsed.data.gameweekNumber, entries };
}
