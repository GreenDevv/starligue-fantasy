// GET /api/matches?gameweek=<number> — matchs d'une journée
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  gameweek: z.coerce.number().int().min(1).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { matches: [], gameweekNumber: null, totalGameweeks: 0 } });
  }

  const now = new Date();

  // Default to current/next gameweek
  let gwNumber = parsed.data.gameweek;
  if (!gwNumber) {
    const next = await prisma.gameweek.findFirst({
      where: { seasonId: season.id, deadlineAt: { gt: now } },
      orderBy: { number: "asc" },
      select: { number: true },
    });
    const last = await prisma.gameweek.findFirst({
      where: { seasonId: season.id },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    gwNumber = next?.number ?? last?.number ?? 1;
  }

  const [gameweek, totalGameweeks] = await Promise.all([
    prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId: season.id, number: gwNumber } },
      include: {
        matches: {
          include: {
            homeClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
            awayClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
          },
          orderBy: { kickoffAt: "asc" },
        },
      },
    }),
    prisma.gameweek.count({ where: { seasonId: season.id } }),
  ]);

  if (!gameweek) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Journée introuvable" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      gameweekId: gameweek.id,
      gameweekNumber: gwNumber,
      deadlineAt: gameweek.deadlineAt,
      totalGameweeks,
      matches: gameweek.matches.map((m) => ({
        id: m.id,
        kickoffAt: m.kickoffAt,
        status: m.status,
        homeClub: m.homeClub,
        awayClub: m.awayClub,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      })),
    },
  });
}
