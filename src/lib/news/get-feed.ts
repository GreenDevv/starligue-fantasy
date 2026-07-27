// Lecture du flux d'actus pour la page publique /starligue.
import { prisma } from "@/lib/db";
import type { NewsCategory } from "@prisma/client";

const PAGE_SIZE = 20;

export interface NewsFeedItem {
  id: string;
  category: NewsCategory;
  sourceType: string;
  sourceKey: string;
  title: string;
  excerpt: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  club: { shortName: string; logoUrl: string | null } | null;
  player: { firstName: string; lastName: string } | null;
}

export interface NewsFeedResult {
  items: NewsFeedItem[];
  page: number;
  hasMore: boolean;
}

export async function getNewsFeed(
  seasonId: string,
  opts: { category?: NewsCategory; page?: number } = {}
): Promise<NewsFeedResult> {
  const page = opts.page && opts.page > 0 ? opts.page : 1;

  const items = await prisma.newsItem.findMany({
    where: { seasonId, deletedAt: null, ...(opts.category ? { category: opts.category } : {}) },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      category: true,
      sourceType: true,
      sourceKey: true,
      title: true,
      excerpt: true,
      sourceUrl: true,
      imageUrl: true,
      publishedAt: true,
      club: { select: { shortName: true, logoUrl: true } },
      player: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    items: items.slice(0, PAGE_SIZE),
    page,
    hasMore: items.length > PAGE_SIZE,
  };
}

export interface NewsItemDetail extends NewsFeedItem {
  content: string | null;
}

/** Détail complet d'une actu — page /starligue/[id] (lecture de l'article sans quitter le site). */
export async function getNewsItemById(id: string): Promise<NewsItemDetail | null> {
  return prisma.newsItem.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      category: true,
      sourceType: true,
      sourceKey: true,
      title: true,
      excerpt: true,
      content: true,
      sourceUrl: true,
      imageUrl: true,
      publishedAt: true,
      club: { select: { shortName: true, logoUrl: true } },
      player: { select: { firstName: true, lastName: true } },
    },
  });
}

/** Dernier NewsItem généré d'une catégorie donnée (TEAM_OF_WEEK/PERFORMANCE) — pour les cartes dédiées de /starligue. */
export async function getLatestGeneratedNews(seasonId: string, category: "TEAM_OF_WEEK" | "PERFORMANCE") {
  return prisma.newsItem.findFirst({
    where: { seasonId, category, sourceType: "GENERATED", deletedAt: null },
    orderBy: { publishedAt: "desc" },
  });
}
