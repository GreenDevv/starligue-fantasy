export const dynamic = "force-dynamic";

// GET /api/admin/news — liste les actus de la saison active (les plus récentes
// d'abord), pour nettoyage manuel (POST/DELETE via /admin/news).

import { NextResponse } from "next/server";
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
    where: { seasonId: season.id },
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
