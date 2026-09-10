// Sous-navigation commune à "Mon équipe" — barre de segments (Terrain /
// Transferts / Trades / Historique) + sélecteur de ligue si l'utilisateur en a
// plusieurs. Le <TeamSubnav> se masque lui-même sur /team/build et /team/start
// (wizards d'onboarding plein écran). Sans ligue / équipe résolue, on ne rend
// que {children} : chaque page gère sa propre redirection.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { hasLiveSeasonStarted, hasSimulationSeasonStarted } from "@/lib/squad/season-lock";
import { TeamSubnav } from "@/components/team/TeamSubnav";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  let subnav: React.ReactNode = null;

  if (userId) {
    const mode = resolveSeasonMode();
    const ctx = await resolveActiveTeamContext(userId, mode);
    if (ctx) {
      const [memberships, seasonStarted] = await Promise.all([
        prisma.leagueMember.findMany({
          where: { userId, league: { seasonId: ctx.seasonId } },
          include: { league: { select: { id: true, name: true } } },
          orderBy: { joinedAt: "asc" },
        }),
        resolveSeasonStarted(mode, ctx.seasonId),
      ]);

      subnav = (
        <TeamSubnav
          leagues={memberships.map((m) => ({ id: m.league.id, name: m.league.name }))}
          activeLeagueId={ctx.leagueId}
          seasonStarted={seasonStarted}
          mode={ctx.mode}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {subnav}
      {children}
    </div>
  );
}

async function resolveSeasonStarted(mode: "live" | "simulation", seasonId: string): Promise<boolean> {
  if (mode === "simulation") {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { currentSimulationGameweekNumber: true },
    });
    return hasSimulationSeasonStarted(season?.currentSimulationGameweekNumber ?? 0);
  }
  const deadlines = await prisma.gameweek.findMany({ where: { seasonId }, select: { deadlineAt: true } });
  return hasLiveSeasonStarted(
    deadlines.map((g) => g.deadlineAt),
    new Date()
  );
}
