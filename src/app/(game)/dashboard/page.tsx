import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DashboardView } from "@/components/DashboardView";
import { getDashboardMatchStrips, getSimulationDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { computeBestXI } from "@/lib/players/compute-best-xi";
import { getClubStandings } from "@/lib/standings/get";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import type { GlobalStandingRow } from "@/components/dashboard/widgets/LeaderboardGlobalWidget";
import type { MyLeagueRow } from "@/components/dashboard/widgets/LeaderboardLeaguesWidget";

const LEADERBOARD_SLICE = 8;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const mode = resolveSeasonMode();
  // @ts-expect-error — role étendu, next-auth non re-déclaré (convention du projet, voir require-admin.ts)
  const isAdmin = session.user?.role === "ADMIN";
  const season =
    mode === "simulation"
      ? await prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } })
      : await prisma.season.findFirst({ where: { isActive: true } });

  if (!season) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-2xl text-text">Dashboard</h1>
        <p className="max-w-xs text-text-muted">Aucune saison active pour l'instant.</p>
      </div>
    );
  }

  const [teams, memberships, dashboardStrips, bestXI, clubStandings] = await Promise.all([
    mode === "simulation"
      ? prisma.simulationTeam.findMany({
          where: { isValidated: true, seasonId: season.id },
          orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }],
          take: LEADERBOARD_SLICE,
          include: { user: { select: { name: true } } },
        })
      : prisma.fantasyTeam.findMany({
          where: { isValidated: true },
          orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }],
          take: LEADERBOARD_SLICE,
          include: { user: { select: { name: true } } },
        }),
    prisma.leagueMember.findMany({
      where: { userId, league: { seasonId: season.id } },
      include: { league: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: "asc" },
    }),
    mode === "simulation"
      ? getSimulationDashboardMatchStrips(season.id, season.currentSimulationGameweekNumber)
      : getDashboardMatchStrips(season.id),
    computeBestXI(season.id),
    getClubStandings(season.id),
  ]);

  const standings: GlobalStandingRow[] = teams.map((t, i) => ({
    rank: i + 1,
    teamId: t.id,
    teamName: t.name,
    userName: t.user.name,
    totalPoints: Number(t.totalPoints),
    jerseyConfig: "jerseyConfig" in t ? t.jerseyConfig : null,
  }));

  const simulationAdmin =
    mode === "simulation" && isAdmin
      ? {
          gameweekNumber: season.currentSimulationGameweekNumber,
          totalGameweeks: await prisma.gameweek.count({ where: { seasonId: season.id } }),
        }
      : null;

  let setupLeagueId: string | null = null;

  const leagues: MyLeagueRow[] = await Promise.all(
    memberships.map(async (m) => {
      const team =
        mode === "simulation"
          ? await prisma.simulationTeam.findFirst({
              where: { userId, leagueId: m.leagueId },
              select: { totalPoints: true, isValidated: true },
            })
          : await prisma.fantasyTeam.findUnique({
              where: { userId_leagueId: { userId, leagueId: m.leagueId } },
              select: { totalPoints: true, isValidated: true },
            });
      // Retient la première ligue où l'effectif n'est pas encore validé — sert de
      // cible au CTA "Construire mon effectif" du bandeau de statut.
      if (!setupLeagueId && !team?.isValidated) setupLeagueId = m.league.id;

      const myPoints = Number(team?.totalPoints ?? 0);
      const higherCount =
        mode === "simulation"
          ? await prisma.simulationTeam.count({
              where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } },
            })
          : await prisma.fantasyTeam.count({
              where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } },
            });
      return {
        id: m.league.id,
        name: m.league.name,
        myRank: higherCount + 1,
        myPoints,
        memberCount: m.league._count.members,
      };
    })
  );

  return (
    <DashboardView
      seasonId={season.id}
      userName={session.user.name ?? null}
      hasLeagues={memberships.length > 0}
      setupLeagueId={setupLeagueId}
      standings={standings}
      leagues={leagues}
      dashboardStrips={dashboardStrips}
      bestXI={bestXI}
      clubStandings={clubStandings}
      simulationAdmin={simulationAdmin}
    />
  );
}
