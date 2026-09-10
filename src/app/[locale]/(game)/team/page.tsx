// "Mon équipe" — vue centrale du jeu (terrain, capitaine, bonus, historique court).
// Entrée de nav à part entière : l'équipe active est résolue via le cookie
// activeLeagueId (ou ?league= explicite), plus besoin de passer par /leagues.
// Une équipe fantasy/simulation n'existe qu'à l'intérieur d'une ligue — sans
// ligue, on renvoie vers /leagues (verrou d'onboarding, ARCHITECTURE.md §2.5).
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { getPendingGameweekRecaps } from "@/lib/team/pending-gameweek-recap";
import { getGameweekChecklist } from "@/lib/team/gameweek-checklist";
import { getCurrentGameweekStatus } from "@/lib/gameweek/get-gameweek-status";
import { MyTeamSection } from "@/components/team/MyTeamSection";
import { GameweekPanel } from "@/components/team/GameweekPanel";
import { GameweekStateBanner } from "@/components/gameweek/GameweekStateBanner";
import { GameweekRecapModal } from "@/components/dashboard/GameweekRecapModal";
import type { BonusType } from "@/components/BonusPicker";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { league?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return null;
  }
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, searchParams.league);
  if (!ctx) {
    redirect({ href: "/leagues", locale: params.locale });
    return null;
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: ctx.teamId },
          include: {
            squad: { include: { player: { include: { club: { select: { shortName: true, logoUrl: true } } } } } },
            bonusUsages: { select: { type: true } },
          },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: ctx.teamId },
          include: {
            squad: { include: { player: { include: { club: { select: { shortName: true, logoUrl: true } } } } } },
            bonusUsages: { select: { type: true } },
          },
        });

  if (!team) {
    redirect({ href: "/leagues", locale: params.locale });
    return null;
  }

  if (!team.isValidated || team.squad.length < 14) {
    redirect({ href: `/team/build?league=${ctx.leagueId}`, locale: params.locale });
    return null;
  }

  if (team.isValidated && team.squad.length === 14 && team.captainId === null) {
    redirect({ href: `/team/start?league=${ctx.leagueId}`, locale: params.locale });
    return null;
  }

  const [pendingRecaps, checklist, currentGwStatus] = await Promise.all([
    getPendingGameweekRecaps(userId, mode, ctx.seasonId),
    mode === "live" ? getGameweekChecklist(ctx.seasonId, ctx.teamId) : Promise.resolve(null),
    mode === "live" ? getCurrentGameweekStatus(ctx.seasonId) : Promise.resolve(null),
  ]);

  const captain = team.captainId ? team.squad.find((s) => s.playerId === team.captainId) : null;
  const captainName = captain ? `${captain.player.firstName} ${captain.player.lastName}` : null;

  return (
    <>
      <GameweekRecapModal recaps={pendingRecaps} />
      {currentGwStatus && (
        <GameweekStateBanner
          context="team"
          data={{
            number: currentGwStatus.number,
            state: currentGwStatus.state,
            tone: currentGwStatus.tone,
            matchesFinished: currentGwStatus.matchesFinished,
            matchesTotal: currentGwStatus.matchesTotal,
            hasCorrection: currentGwStatus.hasCorrection,
            correctionAt: currentGwStatus.correctionAt?.toISOString() ?? null,
          }}
        />
      )}
      {checklist && (
        <GameweekPanel
          gameweekNumber={checklist.gameweekNumber}
          deadlineAt={checklist.deadlineAt}
          leagueId={ctx.leagueId}
          captainName={captainName}
          pendingBonus={team.pendingBonus as BonusType | null}
          predictions={checklist.predictions}
        />
      )}
      <MyTeamSection mode={ctx.mode} leagueId={ctx.leagueId} seasonId={ctx.seasonId} team={team} />
    </>
  );
}
