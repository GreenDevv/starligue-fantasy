// GET /api/leaderboard/gameweek/:number — classement d'une journée
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { number: string } }
) {
  const gwNumber = parseInt(params.number, 10);
  if (isNaN(gwNumber) || gwNumber < 1) {
    return NextResponse.json(
      { error: { code: "INVALID_PARAM", message: "Numéro de journée invalide" } },
      { status: 400 }
    );
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { standings: [], gameweekNumber: gwNumber } });
  }

  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: gwNumber } },
    select: { id: true, number: true, isScored: true },
  });

  if (!gameweek) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Journée introuvable" } },
      { status: 404 }
    );
  }

  const lineups = await prisma.fantasyLineup.findMany({
    where: { gameweekId: gameweek.id, points: { not: null } },
    include: {
      fantasyTeam: {
        include: {
          user: { select: { id: true, name: true } },
          league: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ points: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    data: {
      gameweekNumber: gwNumber,
      isScored: gameweek.isScored,
      standings: lineups.map((l, i) => ({
        rank: i + 1,
        teamId: l.fantasyTeamId,
        teamName: l.fantasyTeam.name,
        userId: l.fantasyTeam.user.id,
        userName: l.fantasyTeam.user.name,
        points: Number(l.points),
        leagueId: l.fantasyTeam.league.id,
        leagueName: l.fantasyTeam.league.name,
        jerseyConfig: l.fantasyTeam.jerseyConfig,
      })),
    },
  });
}
