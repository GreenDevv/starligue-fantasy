// GET /api/gameweeks/current — prochaine deadline à venir
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const now = new Date();
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  const gameweek = season
    ? await prisma.gameweek.findFirst({
        where: { seasonId: season.id, deadlineAt: { gt: now } },
        orderBy: { number: "asc" },
        select: { id: true, number: true, deadlineAt: true, isScored: true },
      })
    : null;

  return NextResponse.json({
    data: gameweek
      ? {
          id: gameweek.id,
          number: gameweek.number,
          deadlineAt: gameweek.deadlineAt.toISOString(),
          isScored: gameweek.isScored,
        }
      : null,
  });
}
