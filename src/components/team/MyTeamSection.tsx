// "Mon équipe" — terrain, capitaine, bonus, conversion budget, historique court.
// Extrait de (game)/leagues/[id]/page.tsx : l'équipe vit désormais sur /team
// (une entrée de nav à part entière), la page ligue ne montre plus que la ligue
// elle-même (classement, chat, invit). Composant serveur async, rendu par
// (game)/team/page.tsx une fois l'équipe active résolue. La sous-navigation
// (transferts, trades, renommage, sélecteur de ligue) est fournie par
// (game)/team/layout.tsx via <TeamSubnav>.
import { prisma } from "@/lib/db";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { getDashboardMatchStrips, getSimulationDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { TeamView } from "@/components/TeamView";
import type { SeasonMode } from "@/lib/team/active-team-context";

export interface TeamWithSquad {
  id: string;
  name: string;
  totalPoints: unknown;
  budget: unknown;
  jerseyConfig?: unknown;
  captainId: string | null;
  pendingBonus: "TRIPLE_CAPTAIN" | "BENCH_BOOST" | "INSURANCE" | "STATISTICIAN" | null;
  bonusUsages: Array<{ type: "TRIPLE_CAPTAIN" | "BENCH_BOOST" | "INSURANCE" | "STATISTICIAN" }>;
  squad: Array<{
    id: string;
    role: string;
    playerId: string;
    player: {
      firstName: string;
      lastName: string;
      position: string;
      photoUrl: string | null;
      photoOffsetX: number;
      photoOffsetY: number;
      photoZoom: unknown;
      marketValue: unknown;
      club: { shortName: string; logoUrl: string | null };
    };
  }>;
}

export async function MyTeamSection({
  mode,
  leagueId,
  seasonId,
  team,
}: {
  mode: SeasonMode;
  leagueId: string;
  seasonId: string;
  team: TeamWithSquad;
}) {
  const squad = team.squad.map((s) => ({
    squadEntryId: s.id,
    playerId: s.playerId,
    firstName: s.player.firstName,
    lastName: s.player.lastName,
    position: s.player.position,
    photoUrl: s.player.photoUrl,
    photoOffsetX: s.player.photoOffsetX,
    photoOffsetY: s.player.photoOffsetY,
    photoZoom: Number(s.player.photoZoom),
    club: s.player.club,
    role: s.role as "STARTER" | "BENCH",
    marketValue: Number(s.player.marketValue),
  }));

  const [pointsRateConfig, seasonBonusQuotaConfig] = await Promise.all([
    prisma.gameConfig.findUnique({ where: { key: "POINTS_TO_BUDGET_RATE" } }),
    prisma.gameConfig.findUnique({ where: { key: "SEASON_BONUS_QUOTA_PER_SEASON" } }),
  ]);
  const pointsToBudgetRate = pointsRateConfig ? parseFloat(pointsRateConfig.value) : 0.1;
  const seasonBonusQuota = seasonBonusQuotaConfig ? parseInt(seasonBonusQuotaConfig.value, 10) : 3;

  let lastScoredGameweek: { number: number; points: number; lineupId: string; gameweekId: string } | null = null;
  let transferWindowOpen = false;
  let dashboardStrips = null;

  if (mode === "simulation") {
    const lastLineup = await prisma.simulationLineup.findFirst({
      where: { simulationTeamId: team.id, points: { not: null } },
      orderBy: { gameweek: { number: "desc" } },
      include: { gameweek: { select: { number: true } } },
    });
    lastScoredGameweek =
      lastLineup && lastLineup.points !== null
        ? {
            number: lastLineup.gameweek.number,
            points: Number(lastLineup.points),
            lineupId: lastLineup.id,
            gameweekId: lastLineup.gameweekId,
          }
        : null;
    const season = await prisma.season.findUniqueOrThrow({
      where: { id: seasonId },
      select: { currentSimulationGameweekNumber: true },
    });
    transferWindowOpen = await isSimulationTransferWindowOpenForSeason(seasonId);
    dashboardStrips = await getSimulationDashboardMatchStrips(seasonId, season.currentSimulationGameweekNumber);
  } else {
    const lastLineup = await prisma.fantasyLineup.findFirst({
      where: { fantasyTeamId: team.id, points: { not: null } },
      orderBy: { gameweek: { number: "desc" } },
      include: { gameweek: { select: { number: true } } },
    });
    lastScoredGameweek =
      lastLineup && lastLineup.points !== null
        ? {
            number: lastLineup.gameweek.number,
            points: Number(lastLineup.points),
            lineupId: lastLineup.id,
            gameweekId: lastLineup.gameweekId,
          }
        : null;
    transferWindowOpen = await isLiveTransferWindowOpenForSeason(seasonId);
    dashboardStrips = await getDashboardMatchStrips(seasonId);
  }

  return (
    <TeamView
      mode={mode}
      teamName={team.name}
      totalPoints={Number(team.totalPoints)}
      budget={Number(team.budget)}
      pointsToBudgetRate={pointsToBudgetRate}
      jerseyConfig={team.jerseyConfig}
      leagueId={leagueId}
      squad={squad}
      lastScoredGameweek={lastScoredGameweek}
      captainId={team.captainId}
      transferWindowOpen={transferWindowOpen}
      dashboardStrips={dashboardStrips}
      statsSeasonId={seasonId}
      pendingBonus={team.pendingBonus}
      usedBonusTypes={team.bonusUsages.map((u) => u.type)}
      seasonBonusQuota={seasonBonusQuota}
    />
  );
}
