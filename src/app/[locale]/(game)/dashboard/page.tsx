import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { DashboardView } from "@/components/DashboardView";
import { getDashboardMatchStrips, getSimulationDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { computeBestXI } from "@/lib/players/compute-best-xi";
import { getClubStandings } from "@/lib/standings/get";
import { getHomeClubsAggregate } from "@/lib/community/home-clubs-query";
import { getClubFantasyRanking } from "@/lib/community/club-fantasy-ranking";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { getPendingGameweekRecaps } from "@/lib/team/pending-gameweek-recap";
import { getLeagueDetail } from "@/lib/leagues/standings";
import { getLastGameweekBreakdownByTeam } from "@/lib/leaderboard/team-breakdown";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import type { GlobalStandingRow } from "@/components/dashboard/widgets/LeaderboardGlobalWidget";
import type { MyLeagueRow } from "@/components/dashboard/widgets/LeaderboardLeaguesWidget";

const LEADERBOARD_SLICE = 8;

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations("dashboard");
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return null;
  }
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
        <h1 className="text-2xl text-text">{t("page.title")}</h1>
        <p className="max-w-xs text-text-muted">{t("page.noActiveSeason")}</p>
      </div>
    );
  }

  const [
    teams,
    memberships,
    dashboardStrips,
    bestXI,
    clubStandings,
    pendingRecaps,
    homeClubsAggregate,
    clubFantasyRanking,
  ] = await Promise.all([
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
      include: { league: { select: { id: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    mode === "simulation"
      ? getSimulationDashboardMatchStrips(season.id, season.currentSimulationGameweekNumber)
      : getDashboardMatchStrips(season.id),
    computeBestXI(season.id),
    getClubStandings(season.id),
    getPendingGameweekRecaps(userId, mode, season.id),
    getHomeClubsAggregate(),
    getClubFantasyRanking({ seasonId: season.id, mode }),
  ]);

  // Aperçu "dernière journée" (effectif vs pronostics) sur le widget dashboard —
  // LIVE uniquement, voir /leaderboard/team/[teamId] pour le détail complet saison.
  const lastGameweekByTeam =
    mode === "live" ? await getLastGameweekBreakdownByTeam(teams.map((t) => t.id)) : new Map();

  const standings: GlobalStandingRow[] = teams.map((t, i) => {
    const breakdown = lastGameweekByTeam.get(t.id);
    return {
      rank: i + 1,
      teamId: t.id,
      teamName: t.name,
      userName: t.user.name,
      totalPoints: Number(t.totalPoints),
      jerseyConfig: "jerseyConfig" in t ? t.jerseyConfig : null,
      lastGameweek: breakdown ? { number: breakdown.gameweekNumber, ...breakdown } : null,
    };
  });

  const simulationAdmin =
    mode === "simulation" && isAdmin
      ? {
          gameweekNumber: season.currentSimulationGameweekNumber,
          totalGameweeks: await prisma.gameweek.count({ where: { seasonId: season.id } }),
        }
      : null;

  let setupLeagueId: string | null = null;

  // Un switcher (onglets) laisse passer d'une ligue à l'autre dans le widget —
  // il faut donc le classement complet de chaque ligue, pas juste mon rang.
  const [leagueDetails, validations] = await Promise.all([
    Promise.all(memberships.map((m) => getLeagueDetail(m.leagueId))),
    Promise.all(
      memberships.map((m) =>
        mode === "simulation"
          ? prisma.simulationTeam.findFirst({
              where: { userId, leagueId: m.leagueId },
              select: { isValidated: true },
            })
          : prisma.fantasyTeam.findUnique({
              where: { userId_leagueId: { userId, leagueId: m.leagueId } },
              select: { isValidated: true },
            })
      )
    ),
  ]);

  // Retient la première ligue où l'effectif n'est pas encore validé — sert de
  // cible au CTA "Construire mon effectif" du bandeau de statut.
  memberships.forEach((m, i) => {
    if (!setupLeagueId && !validations[i]?.isValidated) setupLeagueId = m.league.id;
  });

  const leagues: MyLeagueRow[] = leagueDetails
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      memberCount: d.memberCount,
      standings: d.standings.map((s) => ({
        rank: s.rank,
        teamId: s.teamId,
        teamName: s.teamName,
        userName: s.userName,
        totalPoints: s.totalPoints,
        jerseyConfig: s.jerseyConfig,
        isMe: s.userId === userId,
        breakdown: s.breakdown,
      })),
    }));

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
      homeClubsAggregate={homeClubsAggregate}
      clubFantasyRanking={clubFantasyRanking}
      locale={params.locale}
      mode={mode}
      simulationAdmin={simulationAdmin}
      pendingRecaps={pendingRecaps}
    />
  );
}
