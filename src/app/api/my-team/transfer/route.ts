export const dynamic = "force-dynamic";

// POST /api/my-team/transfer { sellPlayerId, buyPlayerId } — remplace un joueur de
// l'effectif par un autre au même poste, au prix marchand courant des deux côtés.
// Autorisé pendant une fenêtre de transfert ouverte, OU hors fenêtre si le joueur
// vendu est déclaré blessé longue durée (joker médical, quota par saison).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateTransfer } from "@/lib/transfers/validate";
import type { SquadPlayer } from "@/lib/squad/validation";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

const bodySchema = z.object({
  sellPlayerId: z.string().min(1),
  buyPlayerId: z.string().min(1),
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
  const { sellPlayerId, buyPlayerId } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({ where: { id: ctx.teamId }, include: { squad: { include: { player: true } } } })
      : await prisma.fantasyTeam.findUnique({ where: { id: ctx.teamId }, include: { squad: { include: { player: true } } } });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  const buyPlayer = await prisma.player.findUnique({ where: { id: buyPlayerId } });
  if (!buyPlayer) {
    return NextResponse.json({ error: { code: "PLAYER_NOT_FOUND", message: "Joueur introuvable" } }, { status: 404 });
  }

  const sellEntry = team.squad.find((s) => s.playerId === sellPlayerId);

  const windowOpen =
    mode === "simulation"
      ? await isSimulationTransferWindowOpenForSeason(ctx.seasonId)
      : await isLiveTransferWindowOpenForSeason(ctx.seasonId);

  let usesJoker = false;
  if (!windowOpen) {
    const jokerQuotaConfig = await prisma.gameConfig.findUnique({ where: { key: "JOKER_QUOTA_PER_SEASON" } });
    const jokerQuota = jokerQuotaConfig ? parseInt(jokerQuotaConfig.value, 10) : 2;
    const eligibleForJoker = Boolean(sellEntry?.player.injuredAt) && team.jokersUsed < jokerQuota;
    if (!eligibleForJoker) {
      return NextResponse.json(
        {
          error: {
            code: "TRANSFER_WINDOW_CLOSED",
            message: "Aucune fenêtre de transfert ouverte, et pas de joker disponible pour ce joueur",
          },
        },
        { status: 400 }
      );
    }
    usesJoker = true;
  }

  const squadPlayers: SquadPlayer[] = team.squad.map((s) => ({
    id: s.playerId,
    position: s.player.position as SquadPlayer["position"],
    marketValue: Number(s.player.marketValue),
    isActive: s.player.isActive,
    clubId: s.player.clubId,
  }));

  const maxPerClubConfig = await prisma.gameConfig.findUnique({ where: { key: "MAX_PLAYERS_PER_CLUB" } });
  const maxPlayersPerClub = maxPerClubConfig ? parseInt(maxPerClubConfig.value, 10) : 3;

  const { valid, errors, newBudget } = validateTransfer({
    squad: squadPlayers,
    sellPlayerId,
    buyPlayer: {
      id: buyPlayer.id,
      position: buyPlayer.position as SquadPlayer["position"],
      marketValue: Number(buyPlayer.marketValue),
      isActive: buyPlayer.isActive,
      clubId: buyPlayer.clubId,
    },
    budget: Number(team.budget),
    maxPlayersPerClub,
  });

  if (!valid) {
    return NextResponse.json(
      { error: { code: "TRANSFER_INVALID", message: "Transfert invalide", details: errors } },
      { status: 422 }
    );
  }

  if (mode === "simulation") {
    await prisma.$transaction([
      prisma.simulationSquadPlayer.update({
        where: { simulationTeamId_playerId: { simulationTeamId: team.id, playerId: sellPlayerId } },
        data: { playerId: buyPlayerId, purchasePrice: buyPlayer.marketValue },
      }),
      prisma.simulationTeam.update({
        where: { id: team.id },
        data: {
          budget: newBudget,
          ...(usesJoker ? { jokersUsed: { increment: 1 } } : {}),
          ...(team.captainId === sellPlayerId ? { captainId: null } : {}),
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.fantasySquadPlayer.update({
        where: { fantasyTeamId_playerId: { fantasyTeamId: team.id, playerId: sellPlayerId } },
        data: { playerId: buyPlayerId, purchasePrice: buyPlayer.marketValue },
      }),
      prisma.fantasyTeam.update({
        where: { id: team.id },
        data: {
          budget: newBudget,
          ...(usesJoker ? { jokersUsed: { increment: 1 } } : {}),
          // Le capitaine vendu ne fait plus partie de l'effectif : réinitialisé,
          // ce qui permet un nouveau choix libre (voir PUT .../captain).
          ...(team.captainId === sellPlayerId ? { captainId: null } : {}),
        },
      }),
    ]);
  }

  return NextResponse.json({ data: { success: true, newBudget, usedJoker: usesJoker } });
}