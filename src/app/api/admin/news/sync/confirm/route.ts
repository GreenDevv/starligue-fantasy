export const dynamic = "force-dynamic";

// POST /api/admin/news/sync/confirm — publie un item PendingNewsItem renvoyé par
// POST /api/admin/news/sync (fenêtre élargie, run manuel uniquement — voir
// src/lib/news/sync.ts). Refait exactement l'insertion que runNewsSync() aurait
// faite pour un item "aujourd'hui", à partir des champs déjà résolus par ce même
// run (category/clubId/content) — rejoue juste les deux contrôles anti-doublon
// (dedupeKey exact + quasi-doublon cross-source) au cas où l'actu aurait été
// publiée entre-temps par une autre source ou un clic en double côté admin.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashUrl, RECENT_WINDOW_DAYS } from "@/lib/news/sync";
import { findNearDuplicate, type DedupeCandidate } from "@/lib/news/dedupe";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const ConfirmSchema = z.object({
  sourceKey: z.string().min(1),
  sourceType: z.enum(["LNH_SITE", "CLUB_SITE", "MEDIA_SITE"]),
  category: z.enum(["TRANSFER", "INJURY", "TEAM_OF_WEEK", "PERFORMANCE", "GENERAL"]),
  title: z.string().min(1).max(200),
  excerpt: z.string().nullable(),
  content: z.string().nullable(),
  sourceUrl: z.string().url(),
  imageUrl: z.string().nullable(),
  publishedAt: z.coerce.date(),
  clubId: z.string().nullable(),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }
  const item = parsed.data;

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const dedupeKey = `${item.sourceKey}:${hashUrl(item.sourceUrl)}`;
  const existing = await prisma.newsItem.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: { code: "ALREADY_PUBLISHED", message: "Déjà publiée" } }, { status: 409 });
  }

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.newsItem.findMany({
    where: { seasonId: season.id, publishedAt: { gte: since } },
    select: { title: true, publishedAt: true, category: true, clubId: true },
  });
  const recentCandidates: DedupeCandidate[] = recent.map((r) => ({
    title: r.title,
    publishedAt: r.publishedAt,
    category: r.category,
    clubId: r.clubId,
  }));
  const candidate: DedupeCandidate = { title: item.title, publishedAt: item.publishedAt, category: item.category, clubId: item.clubId };
  if (findNearDuplicate(candidate, recentCandidates)) {
    return NextResponse.json({ error: { code: "ALREADY_PUBLISHED", message: "Déjà publiée (quasi-doublon)" } }, { status: 409 });
  }

  const news = await prisma.newsItem.create({
    data: {
      seasonId: season.id,
      category: item.category,
      sourceType: item.sourceType,
      sourceKey: item.sourceKey,
      title: item.title,
      excerpt: item.excerpt,
      content: item.content,
      sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      dedupeKey,
      clubId: item.clubId,
    },
    include: { club: { select: { shortName: true } }, player: { select: { firstName: true, lastName: true } } },
  });

  return NextResponse.json({
    data: {
      id: news.id,
      title: news.title,
      category: news.category,
      sourceType: news.sourceType,
      sourceKey: news.sourceKey,
      sourceUrl: news.sourceUrl,
      publishedAt: news.publishedAt,
      club: news.club?.shortName ?? null,
      player: news.player ? `${news.player.firstName} ${news.player.lastName}` : null,
    },
  });
}
