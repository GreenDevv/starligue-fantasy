export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { hasLiveSeasonStarted, hasSimulationSeasonStarted } from "@/lib/squad/season-lock";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Connexion requise" } },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const explicitLeagueId = new URL(request.url).searchParams.get("league");
  const mode = resolveSeasonMode();
  const ctx = await resolveActiveTeamContext(userId, mode, explicitLeagueId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const squadInclude = {
    include: {
      player: { include: { club: { select: { id: true, name: true, shortName: true, logoUrl: true } } } },
    },
  } as const;

  const [team, jokerQuotaConfig, pointsRateConfig, seasonBonusQuotaConfig, initialBudgetConfig, maxPerClubConfig, league] =
    await Promise.all([
      mode === "simulation"
        ? prisma.simulationTeam.findUnique({
            where: { id: ctx.teamId },
            include: { squad: squadInclude, bonusUsages: { select: { type: true } } },
          })
        : prisma.fantasyTeam.findUnique({
            where: { id: ctx.teamId },
            include: { squad: squadInclude, bonusUsages: { select: { type: true } } },
          }),
      prisma.gameConfig.findUnique({ where: { key: "JOKER_QUOTA_PER_SEASON" } }),
      prisma.gameConfig.findUnique({ where: { key: "POINTS_TO_BUDGET_RATE" } }),
      prisma.gameConfig.findUnique({ where: { key: "SEASON_BONUS_QUOTA_PER_SEASON" } }),
      prisma.gameConfig.findUnique({ where: { key: "INITIAL_BUDGET" } }),
      prisma.gameConfig.findUnique({ where: { key: "MAX_PLAYERS_PER_CLUB" } }),
      prisma.league.findUnique({ where: { id: ctx.leagueId }, select: { name: true } }),
    ]);

  if (!team) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Équipe introuvable" } },
      { status: 404 }
    );
  }

  const initialBudget = parseFloat(initialBudgetConfig?.value ?? process.env.INITIAL_BUDGET ?? "100.0");
  const maxPlayersPerClub = maxPerClubConfig ? parseInt(maxPerClubConfig.value, 10) : 3;
  const jokerQuota = jokerQuotaConfig ? parseInt(jokerQuotaConfig.value, 10) : 2;
  const pointsToBudgetRate = pointsRateConfig ? parseFloat(pointsRateConfig.value) : 0.1;
  const seasonBonusQuota = seasonBonusQuotaConfig ? parseInt(seasonBonusQuotaConfig.value, 10) : 3;
  const [transferWindowOpen, seasonStarted] =
    mode === "simulation"
      ? await Promise.all([
          isSimulationTransferWindowOpenForSeason(ctx.seasonId),
          prisma.season
            .findUniqueOrThrow({ where: { id: ctx.seasonId }, select: { currentSimulationGameweekNumber: true } })
            .then((s) => hasSimulationSeasonStarted(s.currentSimulationGameweekNumber)),
        ])
      : await Promise.all([
          isLiveTransferWindowOpenForSeason(ctx.seasonId),
          prisma.gameweek
            .findMany({ where: { seasonId: ctx.seasonId }, select: { deadlineAt: true } })
            .then((gws) => hasLiveSeasonStarted(gws.map((g) => g.deadlineAt), new Date())),
        ]);

  return NextResponse.json({
    data: {
      id: team.id,
      leagueId: ctx.leagueId,
      leagueName: league?.name ?? null,
      name: team.name,
      jerseyConfig: "jerseyConfig" in team ? team.jerseyConfig : null,
      // team.budget = solde restant (budget initial - dépenses), utilisé par le flux
      // Transferts. initialBudget = enveloppe totale fixe (GameConfig), à utiliser pour
      // revalider un effectif complet (reconstruction totale, pas achat/vente incrémental).
      budget: Number(team.budget),
      initialBudget,
      maxPlayersPerClub,
      totalPoints: Number(team.totalPoints),
      pointsConverted: Number(team.pointsConverted),
      pointsToBudgetRate,
      isValidated: team.isValidated,
      captainId: team.captainId,
      jokersUsed: team.jokersUsed,
      jokersRemaining: Math.max(0, jokerQuota - team.jokersUsed),
      pendingBonus: team.pendingBonus,
      usedBonusTypes: team.bonusUsages.map((u) => u.type),
      seasonBonusQuota,
      transferWindowOpen,
      seasonStarted,
      squad: team.squad.map((s) => ({
        id: s.id,
        role: s.role,
        purchasePrice: Number(s.purchasePrice),
        player: {
          id: s.player.id,
          firstName: s.player.firstName,
          lastName: s.player.lastName,
          position: s.player.position,
          marketValue: Number(s.player.marketValue),
          photoUrl: s.player.photoUrl,
          photoOffsetX: s.player.photoOffsetX,
          photoOffsetY: s.player.photoOffsetY,
          photoZoom: Number(s.player.photoZoom),
          isActive: s.player.isActive,
          injuredAt: s.player.injuredAt,
          club: s.player.club,
        },
      })),
    },
  });
}