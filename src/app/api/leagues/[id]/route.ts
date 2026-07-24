// GET /api/leagues/:id — détail + classement | DELETE — supprimer (owner)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteTeamsCascade, deleteSimulationTeamsCascade, getLeagueDetail, isLeagueMember } from "@/lib/leagues/standings";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userId = session.user.id;

  const league = await getLeagueDetail(params.id);
  if (!league) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Ligue introuvable" } },
      { status: 404 }
    );
  }

  if (!(await isLeagueMember(params.id, userId))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Tu n'es pas membre de cette ligue" } },
      { status: 403 }
    );
  }

  return NextResponse.json({
    data: {
      id: league.id,
      name: league.name,
      mode: league.mode,
      inviteCode: league.ownerId === userId ? league.inviteCode : null,
      isOwner: league.ownerId === userId,
      memberCount: league.memberCount,
      maxMembers: league.maxMembers,
      standings: league.standings,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    select: { ownerId: true, season: { select: { label: true } } },
  });

  if (!league) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND" } },
      { status: 404 }
    );
  }

  if (league.ownerId !== session.user.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Seul le créateur peut supprimer la ligue" } },
      { status: 403 }
    );
  }

  const isSimulation = league.season.label === SIMULATION_SEASON_LABEL;

  await prisma.$transaction(async (tx) => {
    if (isSimulation) {
      const teams = await tx.simulationTeam.findMany({ where: { leagueId: params.id }, select: { id: true } });
      await deleteSimulationTeamsCascade(tx, teams.map((t) => t.id));
    } else {
      const teams = await tx.fantasyTeam.findMany({ where: { leagueId: params.id }, select: { id: true } });
      await deleteTeamsCascade(tx, teams.map((t) => t.id));
    }
    await tx.leagueMember.deleteMany({ where: { leagueId: params.id } });
    await tx.league.delete({ where: { id: params.id } });
  });

  return NextResponse.json({ data: { success: true } });
}
