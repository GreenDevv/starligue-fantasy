// POST /api/trades/:id/accept — exécute un trade PENDING : seul le destinataire peut
// accepter. Re-valide à froid le squad et le budget (relus au moment de l'acceptation,
// pas ceux de la création) pour se protéger d'un joueur revendu entre-temps. Si invalide,
// la proposition reste PENDING — le destinataire peut alors la refuser (le proposeur ne
// peut plus rien y faire d'autre que la laisser expirer, cf. resolveTradeStatus). Les
// trades ne sont pas soumis aux fenêtres de transfert (contrairement aux transferts du
// marché) — autorisés toute la saison. Mode (live/simulation) résolu via resolveSeasonMode().
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateTradeExecution, resolveTradeStatus } from "@/lib/trades/proposal";
import { loadTeamSquadForTrade, loadSimulationTeamSquadForTrade } from "@/lib/trades/team-squad";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const mode = resolveSeasonMode();

  const proposal =
    mode === "simulation"
      ? await prisma.simulationTradeProposal.findUnique({
          where: { id: params.id },
          include: { players: true, receivingTeam: true, proposingTeam: true },
        })
      : await prisma.tradeProposal.findUnique({
          where: { id: params.id },
          include: { players: true, receivingTeam: true, proposingTeam: true },
        });
  if (!proposal) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Proposition introuvable" } }, { status: 404 });
  }

  if (proposal.receivingTeam.userId !== session.user.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Seul le destinataire peut accepter ce trade" } },
      { status: 403 }
    );
  }

  const now = new Date();
  const effectiveStatus = resolveTradeStatus(proposal.status, proposal.expiresAt, now);
  if (effectiveStatus !== "PENDING") {
    if (effectiveStatus === "EXPIRED" && proposal.status !== "EXPIRED") {
      if (mode === "simulation") {
        await prisma.simulationTradeProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } });
      } else {
        await prisma.tradeProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } });
      }
    }
    return NextResponse.json(
      { error: { code: "TRADE_NOT_PENDING", message: `Cette proposition n'est plus en attente (${effectiveStatus})` } },
      { status: 409 }
    );
  }

  // Les trades sont autorisés toute la saison, indépendamment des fenêtres de
  // transfert (contrairement aux transferts du marché) — pas de contrôle de
  // fenêtre ici.
  const offeredPlayerIds = proposal.players.filter((p) => p.side === "PROPOSER").map((p) => p.playerId);
  const requestedPlayerIds = proposal.players.filter((p) => p.side === "RECEIVER").map((p) => p.playerId);

  const [proposerData, receiverData] =
    mode === "simulation"
      ? await Promise.all([
          loadSimulationTeamSquadForTrade(proposal.proposingTeamId),
          loadSimulationTeamSquadForTrade(proposal.receivingTeamId),
        ])
      : await Promise.all([
          loadTeamSquadForTrade(proposal.proposingTeamId),
          loadTeamSquadForTrade(proposal.receivingTeamId),
        ]);
  if (!proposerData || !receiverData) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  const budgetAdjustment = Number(proposal.budgetAdjustment);
  const { valid, errors, newProposerBudget, newReceiverBudget } = validateTradeExecution({
    proposerSquad: proposerData.squad,
    proposerBudget: proposerData.budget,
    receiverSquad: receiverData.squad,
    receiverBudget: receiverData.budget,
    offeredPlayerIds,
    requestedPlayerIds,
    budgetAdjustment,
  });

  if (!valid) {
    return NextResponse.json(
      { error: { code: "TRADE_INVALID", message: "Ce trade n'est plus valide (effectif ou budget ont changé)", details: errors } },
      { status: 422 }
    );
  }

  const marketValueByPlayerId = new Map(
    [...proposerData.squad, ...receiverData.squad].map((p) => [p.id, p.marketValue])
  );

  if (mode === "simulation") {
    await prisma.$transaction([
      ...offeredPlayerIds.map((playerId) =>
        prisma.simulationSquadPlayer.update({
          where: { simulationTeamId_playerId: { simulationTeamId: proposal.proposingTeamId, playerId } },
          data: {
            simulationTeamId: proposal.receivingTeamId,
            role: "BENCH",
            purchasePrice: marketValueByPlayerId.get(playerId) ?? 0,
          },
        })
      ),
      ...requestedPlayerIds.map((playerId) =>
        prisma.simulationSquadPlayer.update({
          where: { simulationTeamId_playerId: { simulationTeamId: proposal.receivingTeamId, playerId } },
          data: {
            simulationTeamId: proposal.proposingTeamId,
            role: "BENCH",
            purchasePrice: marketValueByPlayerId.get(playerId) ?? 0,
          },
        })
      ),
      prisma.simulationTeam.update({
        where: { id: proposal.proposingTeamId },
        data: {
          budget: newProposerBudget,
          ...(proposerData.captainId && offeredPlayerIds.includes(proposerData.captainId) ? { captainId: null } : {}),
        },
      }),
      prisma.simulationTeam.update({
        where: { id: proposal.receivingTeamId },
        data: {
          budget: newReceiverBudget,
          ...(receiverData.captainId && requestedPlayerIds.includes(receiverData.captainId) ? { captainId: null } : {}),
        },
      }),
      prisma.simulationTradeProposal.update({
        where: { id: proposal.id },
        data: { status: "ACCEPTED", respondedAt: now },
      }),
    ]);
  } else {
    await prisma.$transaction([
      ...offeredPlayerIds.map((playerId) =>
        prisma.fantasySquadPlayer.update({
          where: { fantasyTeamId_playerId: { fantasyTeamId: proposal.proposingTeamId, playerId } },
          data: {
            fantasyTeamId: proposal.receivingTeamId,
            role: "BENCH",
            purchasePrice: marketValueByPlayerId.get(playerId) ?? 0,
          },
        })
      ),
      ...requestedPlayerIds.map((playerId) =>
        prisma.fantasySquadPlayer.update({
          where: { fantasyTeamId_playerId: { fantasyTeamId: proposal.receivingTeamId, playerId } },
          data: {
            fantasyTeamId: proposal.proposingTeamId,
            role: "BENCH",
            purchasePrice: marketValueByPlayerId.get(playerId) ?? 0,
          },
        })
      ),
      prisma.fantasyTeam.update({
        where: { id: proposal.proposingTeamId },
        data: {
          budget: newProposerBudget,
          ...(proposerData.captainId && offeredPlayerIds.includes(proposerData.captainId) ? { captainId: null } : {}),
        },
      }),
      prisma.fantasyTeam.update({
        where: { id: proposal.receivingTeamId },
        data: {
          budget: newReceiverBudget,
          ...(receiverData.captainId && requestedPlayerIds.includes(receiverData.captainId) ? { captainId: null } : {}),
        },
      }),
      prisma.tradeProposal.update({
        where: { id: proposal.id },
        data: { status: "ACCEPTED", respondedAt: now },
      }),
    ]);
  }

  return NextResponse.json({ data: { success: true } });
}
