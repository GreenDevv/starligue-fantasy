// GET /api/leaderboard — classement global paginé
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
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

  const { page, perPage } = parsed.data;

  const [total, teams] = await Promise.all([
    prisma.fantasyTeam.count({ where: { isValidated: true } }),
    prisma.fantasyTeam.findMany({
      where: { isValidated: true },
      orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        user: { select: { id: true, name: true } },
        league: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      standings: teams.map((t, i) => ({
        rank: (page - 1) * perPage + i + 1,
        teamId: t.id,
        teamName: t.name,
        userId: t.user.id,
        userName: t.user.name,
        totalPoints: Number(t.totalPoints),
        leagueId: t.league.id,
        leagueName: t.league.name,
        jerseyConfig: t.jerseyConfig,
      })),
      total,
      page,
      perPage,
    },
  });
}
