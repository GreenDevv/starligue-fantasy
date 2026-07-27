// Une équipe (fantasy ou simulation) n'existe qu'à l'intérieur d'une ligue — cette
// page est donc à la fois "ma ligue" (classement) ET "mon équipe" (terrain,
// budget, capitaine…) : cliquer sur une ligue affiche directement l'équipe qui lui
// est associée. Mode dérivé de league.mode (getLeagueDetail), pas du cookie
// seasonMode — voir plan de fusion live/simulation, étape 5.
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getLeagueDetail, isLeagueMember } from "@/lib/leagues/standings";
import { isLiveTransferWindowOpenForSeason, isSimulationTransferWindowOpenForSeason } from "@/lib/transfers/status";
import { hasLiveSeasonStarted, hasSimulationSeasonStarted } from "@/lib/squad/season-lock";
import { getDashboardMatchStrips, getSimulationDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { TeamView } from "@/components/TeamView";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import {
  CopyInviteButton,
  LeaveLeagueButton,
  DeleteLeagueButton,
} from "@/components/leagues/LeagueDetailActions";
import { LeagueChat } from "@/components/leagues/LeagueChat";
import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import type { SeasonMode } from "@/lib/team/active-team-context";

export default async function LeagueDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const leagueId = params.id;

  const league = await getLeagueDetail(leagueId);
  if (!league) notFound();
  if (!(await isLeagueMember(leagueId, userId))) redirect("/leagues");

  const mode = league.mode;

  const [team, memberships] = await Promise.all([
    mode === "simulation"
      ? prisma.simulationTeam.findFirst({
          where: { userId, leagueId },
          include: {
            squad: { include: { player: { include: { club: { select: { shortName: true, logoUrl: true } } } } } },
            bonusUsages: { select: { type: true } },
          },
        })
      : prisma.fantasyTeam.findUnique({
          where: { userId_leagueId: { userId, leagueId } },
          include: {
            squad: { include: { player: { include: { club: { select: { shortName: true, logoUrl: true } } } } } },
            bonusUsages: { select: { type: true } },
          },
        }),
    prisma.leagueMember.findMany({
      where: { userId, league: { seasonId: league.seasonId } },
      include: { league: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);
  if (!team) redirect("/leagues");

  if (team.isValidated && team.squad.length === 14 && team.captainId === null) {
    redirect(`/team/start?league=${leagueId}`);
  }

  const isOwner = league.ownerId === userId;
  const myPoints = Number(team.totalPoints);
  const [globalHigherCount, globalTotal] =
    mode === "simulation"
      ? await Promise.all([
          prisma.simulationTeam.count({ where: { isValidated: true, totalPoints: { gt: myPoints } } }),
          prisma.simulationTeam.count({ where: { isValidated: true } }),
        ])
      : await Promise.all([
          prisma.fantasyTeam.count({ where: { isValidated: true, totalPoints: { gt: myPoints } } }),
          prisma.fantasyTeam.count({ where: { isValidated: true } }),
        ]);
  const globalRank = globalHigherCount + 1;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/leagues" className="text-sm text-text-muted transition-colors hover:text-text">
        ← Mes ligues
      </Link>

      <div>
        <h1 className="text-2xl text-text">{league.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {league.memberCount}/{league.maxMembers} membres
        </p>
      </div>

      {isOwner && (
        <div className="pixel-corners border border-border bg-surface p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-text-muted">Code d'invitation</p>
          <div className="flex items-center gap-3">
            <span className="font-arcade text-2xl tracking-widest text-accent drop-shadow-[0_0_6px_currentColor]">{league.inviteCode}</span>
            <CopyInviteButton inviteCode={league.inviteCode} />
          </div>
        </div>
      )}

      {/* Mon équipe */}
      {!team.isValidated || team.squad.length < 14 ? (
        <div className="pixel-corners flex flex-col items-center gap-4 border border-border bg-surface py-12 text-center">
          <h2 className="text-xl text-text">Compose ton effectif</h2>
          <p className="max-w-xs text-text-muted">
            Tu n'as pas encore constitué ton effectif de 14 joueurs pour cette ligue.
          </p>
          <LinkButton href={`/team/build?league=${leagueId}`} size="lg">
            Créer mon effectif →
          </LinkButton>
        </div>
      ) : (
        <MyTeamSection mode={mode} leagueId={leagueId} seasonId={league.seasonId} team={team} memberships={memberships} />
      )}

      {/* Classement de la ligue */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Classement de la ligue</p>
        <LeaderboardList entries={league.standings} currentUserId={userId} pointsKey="totalPoints" />
      </div>

      {/* Chat de ligue */}
      <LeagueChat leagueId={league.id} currentUserId={userId} />

      {/* Classement général — seulement en live (pas de classement global simulation) */}
      {mode === "live" && (
        <Link
          href="/leaderboard"
          className="pixel-corners flex items-center justify-between border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40"
        >
          <div>
            <p className="text-xs uppercase tracking-widest text-text-muted">Classement général</p>
            <p className="mt-0.5 text-sm text-text-muted">Toutes ligues confondues</p>
          </div>
          <p className="font-arcade text-xl text-text tabular-nums">
            #{globalRank} <span className="text-sm font-sans text-text-muted">/ {globalTotal}</span>
          </p>
        </Link>
      )}

      <div className="flex items-center justify-between pt-2">
        {isOwner ? <DeleteLeagueButton leagueId={league.id} /> : <LeaveLeagueButton leagueId={league.id} />}
      </div>
    </div>
  );
}

interface TeamWithSquad {
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

async function MyTeamSection({
  mode,
  leagueId,
  seasonId,
  team,
  memberships,
}: {
  mode: SeasonMode;
  leagueId: string;
  seasonId: string;
  team: TeamWithSquad;
  memberships: Array<{ league: { id: string; name: string } }>;
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
  let seasonStarted = false;
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
    seasonStarted = hasSimulationSeasonStarted(season.currentSimulationGameweekNumber);
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
    const gameweekDeadlines = await prisma.gameweek.findMany({ where: { seasonId }, select: { deadlineAt: true } });
    seasonStarted = hasLiveSeasonStarted(gameweekDeadlines.map((g) => g.deadlineAt), new Date());
    dashboardStrips = await getDashboardMatchStrips(seasonId);
  }

  const leagues = memberships.map((m) => ({ id: m.league.id, name: m.league.name }));

  return (
    <TeamView
      mode={mode}
      teamName={team.name}
      totalPoints={Number(team.totalPoints)}
      budget={Number(team.budget)}
      pointsToBudgetRate={pointsToBudgetRate}
      jerseyConfig={team.jerseyConfig}
      leagueId={leagueId}
      leagues={leagues.length > 1 ? leagues : undefined}
      squad={squad}
      lastScoredGameweek={lastScoredGameweek}
      captainId={team.captainId}
      transferWindowOpen={transferWindowOpen}
      seasonStarted={seasonStarted}
      dashboardStrips={dashboardStrips}
      statsSeasonId={seasonId}
      pendingBonus={team.pendingBonus}
      usedBonusTypes={team.bonusUsages.map((u) => u.type)}
      seasonBonusQuota={seasonBonusQuota}
    />
  );
}
