// PUT /api/my-team/captain — désigne le capitaine (×2 points s'il est titulaire à
// la journée). Modifiable librement tant qu'aucun capitaine n'a jamais été choisi,
// sinon uniquement pendant une fenêtre de transfert ouverte.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

const bodySchema = z.object({ playerId: z.string().min(1), leagueId: z.string().cuid().optional() });

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }
  const { playerId } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: ctx.teamId },
          include: { squad: { select: { playerId: true } } },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: ctx.teamId },
          include: { squad: { select: { playerId: true } } },
        });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  if (!team.squad.some((s) => s.playerId === playerId)) {
    return NextResponse.json(
      { error: { code: "PLAYER_NOT_IN_SQUAD", message: "Ce joueur n'est pas dans ton effectif" } },
      { status: 422 }
    );
  }

  if (team.captainId !== null) {
    const windowOpen =
      mode === "simulation"
        ? await isSimulationTransferWindowOpenForSeason(ctx.seasonId)
        : await isLiveTransferWindowOpenForSeason(ctx.seasonId);
    if (!windowOpen) {
      return NextResponse.json(
        {
          error: {
            code: "CAPTAIN_LOCKED",
            message: "Le capitaine ne peut être changé que pendant une fenêtre de transfert",
          },
        },
        { status: 400 }
      );
    }
  }

  if (mode === "simulation") {
    await prisma.simulationTeam.update({ where: { id: team.id }, data: { captainId: playerId } });
  } else {
    await prisma.fantasyTeam.update({ where: { id: team.id }, data: { captainId: playerId } });
  }

  return NextResponse.json({ data: { captainId: playerId } });
}
