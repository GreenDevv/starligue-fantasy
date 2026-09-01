export const dynamic = "force-dynamic";

// GET /api/leaderboard/gameweek/:number — classement d'une journée
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { predictionDeltaPoints } from "@/lib/predictions/multiplier";

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
      standings: lineups.map((l, i) => {
        const points = Number(l.points);
        const rawPoints = l.rawPoints !== null ? Number(l.rawPoints) : null;
        return {
          rank: i + 1,
          teamId: l.fantasyTeamId,
          teamName: l.fantasyTeam.name,
          userId: l.fantasyTeam.user.id,
          userName: l.fantasyTeam.user.name,
          points,
          leagueId: l.fantasyTeam.league.id,
          leagueName: l.fantasyTeam.league.name,
          jerseyConfig: l.fantasyTeam.jerseyConfig,
          // Décompose CETTE journée-là (pas la dernière notée, celle-ci
          // l'est déjà) — voir /leaderboard/team/[teamId] pour le détail saison.
          breakdown:
            rawPoints !== null
              ? { gameweekNumber: gwNumber, rawPoints, predictionDelta: predictionDeltaPoints(rawPoints, points) }
              : null,
        };
      }),
    },
  });
}