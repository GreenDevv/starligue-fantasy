import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateLineup } from "@/lib/squad/validation";
import type { LineupPlayer } from "@/lib/squad/validation";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { isLineupEditLocked } from "@/lib/transfers/deadline";

const bodySchema = z.object({
  starters: z.array(z.string()).length(7),
  leagueId: z.string().cuid().optional(),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Connexion requise" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { starters } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: ctx.teamId },
          include: { squad: { include: { player: { select: { position: true } } } } },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: ctx.teamId },
          include: { squad: { include: { player: { select: { position: true } } } } },
        });

  if (!team) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Équipe introuvable" } },
      { status: 404 }
    );
  }

  if (!team.isValidated) {
    return NextResponse.json(
      { error: { code: "SQUAD_NOT_VALIDATED", message: "Effectif non validé" } },
      { status: 400 }
    );
  }

  // Contrôle de deadline serveur — bloque en live si une journée est en cours
  // (deadline passée, pas encore scorée) ; jamais en simulation (voir isLineupEditLocked).
  const now = new Date();
  const activeGameweek = await prisma.gameweek.findFirst({
    where: { seasonId: ctx.seasonId, deadlineAt: { lte: now }, isScored: false },
    orderBy: { number: "asc" },
  });

  if (isLineupEditLocked(mode, activeGameweek !== null)) {
    return NextResponse.json(
      {
        error: {
          code: "DEADLINE_PASSED",
          message: `La deadline de la journée ${activeGameweek!.number} est passée`,
        },
      },
      { status: 400 }
    );
  }

  const squadIds = new Set(team.squad.map((s) => s.playerId));
  const lineupPlayers: LineupPlayer[] = team.squad.map((s) => ({
    id: s.playerId,
    position: s.player.position as LineupPlayer["position"],
    isStarter: starters.includes(s.playerId),
  }));

  const { valid, errors } = validateLineup(lineupPlayers, squadIds);
  if (!valid) {
    return NextResponse.json(
      { error: { code: "LINEUP_INVALID", message: "Alignement invalide", details: errors } },
      { status: 422 }
    );
  }

  if (mode === "simulation") {
    await prisma.$transaction(
      team.squad.map((s) =>
        prisma.simulationSquadPlayer.update({
          where: { id: s.id },
          data: { role: starters.includes(s.playerId) ? "STARTER" : "BENCH" },
        })
      )
    );
  } else {
    await prisma.$transaction(
      team.squad.map((s) =>
        prisma.fantasySquadPlayer.update({
          where: { id: s.id },
          data: { role: starters.includes(s.playerId) ? "STARTER" : "BENCH" },
        })
      )
    );
  }

  return NextResponse.json({ data: { success: true } });
}
