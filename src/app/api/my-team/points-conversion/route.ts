export const dynamic = "force-dynamic";

// POST /api/my-team/points-conversion { amount } — convertit une partie des points de
// saison de l'équipe en budget de transfert, au taux GameConfig POINTS_TO_BUDGET_RATE.
// Autorisé uniquement pendant une fenêtre de transfert ouverte (même contrainte que
// /api/my-team/transfer). Les points convertis sortent définitivement de totalPoints
// — voir src/lib/scoring/compute.ts::recalcTotalPoints.
import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validatePointsConversion } from "@/lib/budget/points-conversion";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

const bodySchema = z.object({
  amount: z.number().positive(),
  leagueId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }
  const { amount } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({ where: { id: ctx.teamId } })
      : await prisma.fantasyTeam.findUnique({ where: { id: ctx.teamId } });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  const windowOpen =
    mode === "simulation"
      ? await isSimulationTransferWindowOpenForSeason(ctx.seasonId)
      : await isLiveTransferWindowOpenForSeason(ctx.seasonId);
  if (!windowOpen) {
    return NextResponse.json(
      { error: { code: "TRANSFER_WINDOW_CLOSED", message: "Aucune fenêtre de transfert ouverte" } },
      { status: 400 }
    );
  }

  const rateConfig = await prisma.gameConfig.findUnique({ where: { key: "POINTS_TO_BUDGET_RATE" } });
  const rate = rateConfig ? parseFloat(rateConfig.value) : 0.1;

  const { valid, errors, budgetGained } = validatePointsConversion({
    availablePoints: Number(team.totalPoints),
    amount,
    rate,
  });

  if (!valid) {
    return NextResponse.json(
      { error: { code: "CONVERSION_INVALID", message: "Conversion invalide", details: errors } },
      { status: 422 }
    );
  }

  if (mode === "simulation") {
    await prisma.$transaction([
      prisma.simulationTeam.update({
        where: { id: team.id },
        data: {
          budget: { increment: new Decimal(budgetGained) },
          totalPoints: { decrement: new Decimal(amount) },
          pointsConverted: { increment: new Decimal(amount) },
        },
      }),
      prisma.simulationPointsBudgetConversion.create({
        data: { simulationTeamId: team.id, pointsSpent: new Decimal(amount), budgetGained: new Decimal(budgetGained) },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.fantasyTeam.update({
        where: { id: team.id },
        data: {
          budget: { increment: new Decimal(budgetGained) },
          totalPoints: { decrement: new Decimal(amount) },
          pointsConverted: { increment: new Decimal(amount) },
        },
      }),
      prisma.pointsBudgetConversion.create({
        data: { fantasyTeamId: team.id, pointsSpent: new Decimal(amount), budgetGained: new Decimal(budgetGained) },
      }),
    ]);
  }

  return NextResponse.json({ data: { success: true, budgetGained, pointsSpent: amount } });
}