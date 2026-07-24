export const dynamic = "force-dynamic";

// DELETE /api/leagues/:id/members/me — quitter une ligue (+ supprime l'équipe associée)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteTeamsCascade, deleteSimulationTeamsCascade } from "@/lib/leagues/standings";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userId = session.user.id;

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    select: { ownerId: true, season: { select: { label: true } } },
  });

  if (!league) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (league.ownerId === userId) {
    return NextResponse.json(
      {
        error: {
          code: "OWNER_CANNOT_LEAVE",
          message: "Le créateur ne peut pas quitter sa ligue. Supprime-la ou transfère-la.",
        },
      },
      { status: 400 }
    );
  }

  const isSimulation = league.season.label === SIMULATION_SEASON_LABEL;

  await prisma.$transaction(async (tx) => {
    if (isSimulation) {
      const team = await tx.simulationTeam.findFirst({
        where: { userId, leagueId: params.id },
        select: { id: true },
      });
      if (team) await deleteSimulationTeamsCascade(tx, [team.id]);
    } else {
      const team = await tx.fantasyTeam.findUnique({
        where: { userId_leagueId: { userId, leagueId: params.id } },
        select: { id: true },
      });
      if (team) await deleteTeamsCascade(tx, [team.id]);
    }
    await tx.leagueMember.delete({
      where: { leagueId_userId: { leagueId: params.id, userId } },
    });
  });

  return NextResponse.json({ data: { success: true } });
}