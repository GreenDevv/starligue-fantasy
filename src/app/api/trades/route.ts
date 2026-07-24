export const dynamic = "force-dynamic";

// POST /api/trades — propose un trade (joueur(s) contre joueur(s) + budget) à une
// autre équipe de la même ligue (live ou simulation, résolu via resolveSeasonMode).
// Exécuté seulement à l'acceptation (voir /api/trades/:id/accept) ; ici on valide
// juste que le trade est possible AU MOMENT de la proposition (dry-run).
// GET /api/trades?scope=incoming|outgoing — mes propositions, statut résolu
// paresseusement (PENDING expiré → EXPIRED, persisté à la lecture).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateTradeExecution, resolveTradeStatus } from "@/lib/trades/proposal";
import { loadTeamSquadForTrade, loadSimulationTeamSquadForTrade } from "@/lib/trades/team-squad";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

const createSchema = z.object({
  receivingTeamId: z.string().min(1),
  offeredPlayerIds: z.array(z.string().min(1)).max(14),
  requestedPlayerIds: z.array(z.string().min(1)).max(14),
  budgetAdjustment: z.number().finite(),
  leagueId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }
  const { receivingTeamId, offeredPlayerIds, requestedPlayerIds, budgetAdjustment } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }
  const proposingTeamId = ctx.teamId;

  if (receivingTeamId === proposingTeamId) {
    return NextResponse.json(
      { error: { code: "SELF_TRADE", message: "Impossible de proposer un trade à sa propre équipe" } },
      { status: 400 }
    );
  }

  const receivingTeam =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({ where: { id: receivingTeamId } })
      : await prisma.fantasyTeam.findUnique({ where: { id: receivingTeamId } });
  if (!receivingTeam || receivingTeam.leagueId !== ctx.leagueId) {
    return NextResponse.json(
      { error: { code: "TEAM_NOT_IN_LEAGUE", message: "Équipe destinataire introuvable dans cette ligue" } },
      { status: 404 }
    );
  }

  // Contrairement aux transferts (marché), les trades sont autorisés toute la
  // saison, indépendamment des fenêtres de transfert — seuls les transferts
  // nécessitent une fenêtre ouverte.
  const [proposerData, receiverData] =
    mode === "simulation"
      ? await Promise.all([
          loadSimulationTeamSquadForTrade(proposingTeamId),
          loadSimulationTeamSquadForTrade(receivingTeamId),
        ])
      : await Promise.all([
          loadTeamSquadForTrade(proposingTeamId),
          loadTeamSquadForTrade(receivingTeamId),
        ]);
  if (!proposerData || !receiverData) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  const { valid, errors } = validateTradeExecution({
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
      { error: { code: "TRADE_INVALID", message: "Trade impossible", details: errors } },
      { status: 422 }
    );
  }

  const expiryConfig = await prisma.gameConfig.findUnique({ where: { key: "TRADE_PROPOSAL_EXPIRY_HOURS" } });
  const expiryHours = expiryConfig ? parseFloat(expiryConfig.value) : 72;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const playersCreate = {
    create: [
      ...offeredPlayerIds.map((playerId) => ({ playerId, side: "PROPOSER" as const })),
      ...requestedPlayerIds.map((playerId) => ({ playerId, side: "RECEIVER" as const })),
    ],
  };

  const proposal =
    mode === "simulation"
      ? await prisma.simulationTradeProposal.create({
          data: {
            seasonId: ctx.seasonId,
            leagueId: ctx.leagueId,
            proposingTeamId,
            receivingTeamId,
            budgetAdjustment,
            expiresAt,
            players: playersCreate,
          },
        })
      : await prisma.tradeProposal.create({
          data: {
            leagueId: ctx.leagueId,
            proposingTeamId,
            receivingTeamId,
            budgetAdjustment,
            expiresAt,
            players: playersCreate,
          },
        });

  return NextResponse.json({ data: { id: proposal.id, expiresAt: proposal.expiresAt } }, { status: 201 });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all"; // "incoming" | "outgoing" | "all"
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, url.searchParams.get("league"));
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }
  const teamId = ctx.teamId;

  const where =
    scope === "incoming"
      ? { receivingTeamId: teamId }
      : scope === "outgoing"
        ? { proposingTeamId: teamId }
        : { OR: [{ receivingTeamId: teamId }, { proposingTeamId: teamId }] };

  const proposals =
    mode === "simulation"
      ? await prisma.simulationTradeProposal.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            proposingTeam: { select: { id: true, name: true } },
            receivingTeam: { select: { id: true, name: true } },
            players: { include: { player: { select: { id: true, firstName: true, lastName: true, position: true, marketValue: true } } } },
          },
        })
      : await prisma.tradeProposal.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            proposingTeam: { select: { id: true, name: true, jerseyConfig: true } },
            receivingTeam: { select: { id: true, name: true, jerseyConfig: true } },
            players: { include: { player: { select: { id: true, firstName: true, lastName: true, position: true, marketValue: true } } } },
          },
        });

  const now = new Date();
  const toSync: string[] = [];
  const data = proposals.map((p) => {
    const status = resolveTradeStatus(p.status, p.expiresAt, now);
    if (status !== p.status) toSync.push(p.id);
    return {
      id: p.id,
      status,
      expiresAt: p.expiresAt,
      respondedAt: p.respondedAt,
      createdAt: p.createdAt,
      budgetAdjustment: Number(p.budgetAdjustment),
      direction: p.proposingTeamId === teamId ? "outgoing" : "incoming",
      proposingTeam: { ...p.proposingTeam, jerseyConfig: "jerseyConfig" in p.proposingTeam ? p.proposingTeam.jerseyConfig : null },
      receivingTeam: { ...p.receivingTeam, jerseyConfig: "jerseyConfig" in p.receivingTeam ? p.receivingTeam.jerseyConfig : null },
      offeredPlayers: p.players
        .filter((tp) => tp.side === "PROPOSER")
        .map((tp) => ({ ...tp.player, marketValue: Number(tp.player.marketValue) })),
      requestedPlayers: p.players
        .filter((tp) => tp.side === "RECEIVER")
        .map((tp) => ({ ...tp.player, marketValue: Number(tp.player.marketValue) })),
    };
  });

  if (toSync.length > 0) {
    if (mode === "simulation") {
      await prisma.simulationTradeProposal.updateMany({ where: { id: { in: toSync } }, data: { status: "EXPIRED" } });
    } else {
      await prisma.tradeProposal.updateMany({ where: { id: { in: toSync } }, data: { status: "EXPIRED" } });
    }
  }

  return NextResponse.json({ data });
}