export const dynamic = "force-dynamic";

// GET /api/my-team/history — ARCHITECTURE.md §6.3
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveLeagueId } from "@/lib/team/active-league";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Connexion requise" } },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const explicitLeagueId = new URL(request.url).searchParams.get("league");
  const leagueId = await resolveActiveLeagueId(userId, explicitLeagueId);
  if (!leagueId) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const team = await prisma.fantasyTeam.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true },
  });

  if (!team) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Équipe introuvable" } },
      { status: 404 }
    );
  }

  const lineups = await prisma.fantasyLineup.findMany({
    where: { fantasyTeamId: team.id },
    include: {
      gameweek: {
        select: { number: true, deadlineAt: true, isScored: true },
      },
    },
    orderBy: { gameweek: { number: "desc" } },
  });

  return NextResponse.json({
    data: lineups.map((l) => ({
      id: l.id,
      gameweekId: l.gameweekId,
      gameweekNumber: l.gameweek.number,
      deadlineAt: l.gameweek.deadlineAt,
      isScored: l.gameweek.isScored,
      points: l.points !== null ? Number(l.points) : null,
      bonus: l.bonus,
    })),
  });
}