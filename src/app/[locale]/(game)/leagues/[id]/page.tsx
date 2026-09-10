// Page ligue : le classement de la ligue, le chat, le code d'invitation, le rang
// général. L'équipe elle-même (terrain, capitaine, bonus…) vit sur /team — un
// bouton "Voir mon équipe" bascule la ligue active et y renvoie. Mode dérivé de
// league.mode (getLeagueDetail), pas du cookie seasonMode — voir plan de fusion
// live/simulation, étape 5.
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getLeagueDetail, isLeagueMember } from "@/lib/leagues/standings";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import {
  CopyInviteButton,
  LeaveLeagueButton,
  DeleteLeagueButton,
  SwitchToTeamButton,
} from "@/components/leagues/LeagueDetailActions";
import { LeagueChat } from "@/components/leagues/LeagueChat";
import { GameweekStandingsBanner } from "@/components/gameweek/GameweekStandingsBanner";
import { LinkButton } from "@/components/ui/Button";

export default async function LeagueDetailPage({ params }: { params: { id: string; locale: string } }) {
  const t = await getTranslations("leagues");
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return;
  }
  const userId = session.user.id;
  const leagueId = params.id;

  const league = await getLeagueDetail(leagueId);
  if (!league) notFound();
  if (!(await isLeagueMember(leagueId, userId))) {
    redirect({ href: "/leagues", locale: params.locale });
    return;
  }

  const mode = league.mode;

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findFirst({
          where: { userId, leagueId },
          select: { isValidated: true, totalPoints: true, _count: { select: { squad: true } } },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { userId_leagueId: { userId, leagueId } },
          select: { isValidated: true, totalPoints: true, _count: { select: { squad: true } } },
        });
  if (!team) {
    redirect({ href: "/leagues", locale: params.locale });
    return;
  }

  const squadReady = team.isValidated && team._count.squad === 14;
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
        ← {t("list.title")}
      </Link>

      <div>
        <h1 className="text-2xl text-text">{league.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {t("detail.memberRatio", { count: league.memberCount, max: league.maxMembers })}
        </p>
      </div>

      {isOwner && (
        <div className="pixel-corners border border-border bg-surface p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-text-muted">{t("inviteCodeLabel")}</p>
          <div className="flex items-center gap-3">
            <span className="font-arcade text-2xl tracking-widest text-accent drop-shadow-[0_0_6px_currentColor]">{league.inviteCode}</span>
            <CopyInviteButton inviteCode={league.inviteCode} />
          </div>
        </div>
      )}

      {/* Mon équipe — l'écran complet est sur /team */}
      {squadReady ? (
        <div className="pixel-corners flex items-center justify-between gap-3 border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-muted">{t("detail.myTeamSectionTitle")}</p>
            <p className="mt-0.5 font-arcade text-xl text-accent tabular-nums drop-shadow-[0_0_6px_currentColor]">
              {myPoints} <span className="text-xs font-sans text-text-muted">pts</span>
            </p>
          </div>
          <SwitchToTeamButton leagueId={leagueId} label={t("detail.viewMyTeam")} />
        </div>
      ) : (
        <div className="pixel-corners flex flex-col items-center gap-4 border border-border bg-surface py-12 text-center">
          <h2 className="text-xl text-text">{t("detail.buildSquadTitle")}</h2>
          <p className="max-w-xs text-text-muted">{t("detail.buildSquadDescription")}</p>
          <LinkButton href={`/team/build?league=${leagueId}`} size="lg">
            {t("detail.buildMyTeam")}
          </LinkButton>
        </div>
      )}

      {/* Classement de la ligue */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">{t("detail.leagueLeaderboardTitle")}</p>
        {mode === "live" && <GameweekStandingsBanner />}
        <LeaderboardList
          entries={league.standings}
          currentUserId={userId}
          pointsKey="totalPoints"
          linkToTeam={mode === "live"}
        />
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
            <p className="text-xs uppercase tracking-widest text-text-muted">{t("detail.globalLeaderboardTitle")}</p>
            <p className="mt-0.5 text-sm text-text-muted">{t("detail.globalLeaderboardSubtitle")}</p>
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
