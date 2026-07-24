// GET /api/admin/clubs — liste tous les clubs avec stats joueurs actifs

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

  const clubs = await prisma.club.findMany({
    orderBy: { shortName: "asc" },
    include: {
      _count: {
        select: {
          players: season
            ? { where: { seasonId: season.id, isActive: true } }
            : undefined,
        },
      },
    },
  });

  return NextResponse.json({
    data: {
      clubs: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        logoUrl: c.logoUrl,
        externalIds: c.externalIds as Record<string, string>,
        playerCount: c._count.players,
      })),
    },
  });
}
