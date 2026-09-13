// Résout les payloads JSON des dernières actus TEAM_OF_WEEK/PERFORMANCE (générées par
// generate-weekly-news.ts) vers des détails joueur/club à jour — le payload ne stocke
// que playerId/points (pas de nom/photo dénormalisés), donc toujours à jour même si
// la photo/le club d'un joueur change après coup.
import { prisma } from "@/lib/db";
import { TeamOfWeekPayloadSchema, PerformancesPayloadSchema } from "./payload";
import { getLatestGeneratedNews } from "./get-feed";
import { computeGameweekBestXI } from "@/lib/players/compute-gameweek-best-xi";
import { computeBestXI } from "@/lib/players/compute-best-xi";
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
  return resolveTeamOfWeekCard(newsItem.payload);
}

// Pour la navigation par dropdown de la carte publique (StarligueBestXICard, home) :
// contrairement à getTeamOfWeekCard (qui lit le dernier NewsItem généré, figé au
// moment du scoring), ici on recalcule en direct via computeGameweekBestXI —
// fonctionne pour N'IMPORTE QUELLE journée déjà notée, pas seulement la dernière,
// et reste à jour si un joueur change de photo/club après coup. BestXIEntry a
// déjà exactement la forme de TeamOfWeekCardData["entries"].
export async function getTeamOfWeekCardForGameweek(
  seasonId: string,
  gameweekNumber: number
): Promise<TeamOfWeekCardData | null> {
  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId, number: gameweekNumber } },
    select: { id: true },
  });
  if (!gameweek) return null;
  const entries = await computeGameweekBestXI(gameweek.id);
  if (entries.length === 0) return null;
  return { gameweekNumber, entries };
}

export interface SeasonBestXICardData {
  entries: TeamOfWeekCardData["entries"];
}

// Équipe type de la saison — même calcul que le widget dashboard privé
// (BestXIWidget, computeBestXI), exposé ici pour l'option "Saison" de la carte
// publique.
export async function getSeasonBestXICard(seasonId: string): Promise<SeasonBestXICardData | null> {
  const entries = await computeBestXI(seasonId);
  if (entries.length === 0) return null;
  return { entries };
}

/** Résout un payload TEAM_OF_WEEK brut (d'un NewsItem précis) → carte — page /starligue/[id]. */
export async function resolveTeamOfWeekCard(payload: unknown): Promise<TeamOfWeekCardData | null> {
  const parsed = TeamOfWeekPayloadSchema.safeParse(payload);
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
  return resolvePerformancesCard(newsItem.payload);
}

/** Résout un payload PERFORMANCE brut (d'un NewsItem précis) → carte — page /starligue/[id]. */
export async function resolvePerformancesCard(payload: unknown): Promise<PerformancesCardData | null> {
  const parsed = PerformancesPayloadSchema.safeParse(payload);
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
