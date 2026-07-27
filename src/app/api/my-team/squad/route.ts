export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateSquad } from "@/lib/squad/validation";
import type { SquadPlayer } from "@/lib/squad/validation";
import { hasLiveSeasonStarted, hasSimulationSeasonStarted } from "@/lib/squad/season-lock";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

const bodySchema = z.object({
  playerIds: z.array(z.string()).length(14),
  leagueId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
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

  const { playerIds } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  // Le rebuild complet de l'effectif n'est autorisé qu'avant le début de la
  // saison (phase de draft) — une fois la saison commencée, un effectif déjà
  // validé ne peut plus être remplacé en bloc, seulement modifié via
  // Transferts (marché, fenêtre ouverte) ou Trades (toute la saison).
  const [existingTeam, seasonStarted] = await Promise.all([
    mode === "simulation"
      ? prisma.simulationTeam.findUnique({ where: { id: ctx.teamId }, select: { isValidated: true } })
      : prisma.fantasyTeam.findUnique({ where: { id: ctx.teamId }, select: { isValidated: true } }),
    mode === "simulation"
      ? prisma.season
          .findUniqueOrThrow({ where: { id: ctx.seasonId }, select: { currentSimulationGameweekNumber: true } })
          .then((s) => hasSimulationSeasonStarted(s.currentSimulationGameweekNumber))
      : prisma.gameweek
          .findMany({ where: { seasonId: ctx.seasonId }, select: { deadlineAt: true } })
          .then((gws) => hasLiveSeasonStarted(gws.map((g) => g.deadlineAt), new Date())),
  ]);

  if (existingTeam?.isValidated && seasonStarted) {
    return NextResponse.json(
      {
        error: {
          code: "SEASON_STARTED",
          message: "Effectif verrouillé pour la saison — utilise Transferts ou Trades pour le modifier",
        },
      },
      { status: 400 }
    );
  }

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds }, seasonId: ctx.seasonId },
  });

  if (players.length !== 14) {
    return NextResponse.json(
      { error: { code: "PLAYERS_NOT_FOUND", message: "Certains joueurs sont introuvables" } },
      { status: 400 }
    );
  }

  const [budgetConfig, maxPerClubConfig] = await Promise.all([
    prisma.gameConfig.findUnique({ where: { key: "INITIAL_BUDGET" } }),
    prisma.gameConfig.findUnique({ where: { key: "MAX_PLAYERS_PER_CLUB" } }),
  ]);
  const budget = budgetConfig ? parseFloat(budgetConfig.value) : 100.0;
  const maxPlayersPerClub = maxPerClubConfig ? parseInt(maxPerClubConfig.value, 10) : 3;

  const squadPlayers: SquadPlayer[] = players.map((p) => ({
    id: p.id,
    position: p.position as SquadPlayer["position"],
    marketValue: Number(p.marketValue),
    isActive: p.isActive,
    clubId: p.clubId,
  }));

  const { valid, errors } = validateSquad(squadPlayers, { playersPerPosition: 2, budget, maxPlayersPerClub });
  if (!valid) {
    return NextResponse.json(
      { error: { code: "SQUAD_INVALID", message: "Composition invalide", details: errors } },
      { status: 422 }
    );
  }

  const totalSpent = players.reduce((s, p) => s + Number(p.marketValue), 0);

  // Le build ne fixe plus titulaires/remplaçants : tous BENCH par défaut (rôle du
  // schéma), le choix se fait ensuite sur /team/start (PUT .../lineup).
  if (mode === "simulation") {
    await prisma.$transaction(async (tx) => {
      await tx.simulationSquadPlayer.deleteMany({ where: { simulationTeamId: ctx.teamId } });
      await tx.simulationSquadPlayer.createMany({
        data: players.map((p) => ({ simulationTeamId: ctx.teamId, playerId: p.id, purchasePrice: p.marketValue })),
      });
      await tx.simulationTeam.update({
        where: { id: ctx.teamId },
        data: { budget: budget - totalSpent, isValidated: true, captainId: null },
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.fantasySquadPlayer.deleteMany({ where: { fantasyTeamId: ctx.teamId } });
      await tx.fantasySquadPlayer.createMany({
        data: players.map((p) => ({ fantasyTeamId: ctx.teamId, playerId: p.id, purchasePrice: p.marketValue })),
      });
      await tx.fantasyTeam.update({
        where: { id: ctx.teamId },
        data: { budget: budget - totalSpent, isValidated: true, captainId: null },
      });
    });
  }

  return NextResponse.json({ data: { success: true } });
}