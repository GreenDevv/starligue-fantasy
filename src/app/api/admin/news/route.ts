export const dynamic = "force-dynamic";

// GET /api/admin/news — liste les actus de la saison active (les plus récentes
// d'abord), pour nettoyage manuel (POST/DELETE via /admin/news).
// POST /api/admin/news — crée une actu manuellement (sourceType GENERATED,
// sourceKey "admin"). Catégories volontairement limitées à TRANSFER/INJURY/GENERAL :
// TEAM_OF_WEEK/PERFORMANCE portent un payload JSON structuré (src/lib/news/payload.ts)
// consommé par get-weekly-cards.ts, qu'une actu manuelle sans payload ne peut pas fournir
// (masquerait silencieusement la vraie carte de la journée, getLatestGeneratedNews
// prenant la plus récente des deux).

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { news: [] } });
  }

  const news = await prisma.newsItem.findMany({
    where: { seasonId: season.id, deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 200,
    include: { club: { select: { shortName: true } }, player: { select: { firstName: true, lastName: true } } },
  });

  return NextResponse.json({
    data: {
      news: news.map((n) => ({
        id: n.id,
        title: n.title,
        category: n.category,
        sourceType: n.sourceType,
        sourceKey: n.sourceKey,
        sourceUrl: n.sourceUrl,
        publishedAt: n.publishedAt,
        club: n.club?.shortName ?? null,
        player: n.player ? `${n.player.firstName} ${n.player.lastName}` : null,
      })),
    },
  });
}

const CreateSchema = z.object({
  category: z.enum(["TRANSFER", "INJURY", "GENERAL"]),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).optional().or(z.literal("")),
  content: z.string().max(20000).optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  publishedAt: z.coerce.date().optional(),
  clubId: z.string().optional().or(z.literal("")),
  playerId: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const { category, title, excerpt, content, imageUrl, sourceUrl, publishedAt, clubId, playerId } = parsed.data;

  const news = await prisma.newsItem.create({
    data: {
      seasonId: season.id,
      category,
      sourceType: "GENERATED",
      sourceKey: "admin",
      title,
      excerpt: excerpt || null,
      content: content || null,
      imageUrl: imageUrl || null,
      sourceUrl: sourceUrl || null,
      publishedAt: publishedAt ?? new Date(),
      dedupeKey: `admin:${randomUUID()}`,
      clubId: clubId || null,
      playerId: playerId || null,
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
