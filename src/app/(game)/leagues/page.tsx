import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { LeaguesView } from "@/components/leagues/LeaguesView";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";

export default async function LeaguesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);

  if (!season) {
    return <LeaguesView initialLeagues={[]} mode={mode} />;
  }

  const memberships = await prisma.leagueMember.findMany({
    where: { userId, league: { seasonId: season.id } },
    include: { league: { include: { _count: { select: { members: true } } } } },
    orderBy: { joinedAt: "asc" },
  });

  const leagues = await Promise.all(
    memberships.map(async (m) => {
      const team =
        mode === "simulation"
          ? await prisma.simulationTeam.findFirst({
              where: { userId, leagueId: m.leagueId },
              select: { totalPoints: true },
            })
          : await prisma.fantasyTeam.findUnique({
              where: { userId_leagueId: { userId, leagueId: m.leagueId } },
              select: { totalPoints: true, jerseyConfig: true },
            });
      const myPoints = Number(team?.totalPoints ?? 0);
      const higherCount =
        mode === "simulation"
          ? await prisma.simulationTeam.count({ where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } } })
          : await prisma.fantasyTeam.count({ where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } } });
      return {
        id: m.league.id,
        name: m.league.name,
        inviteCode: m.league.ownerId === userId ? m.league.inviteCode : null,
        isOwner: m.league.ownerId === userId,
        memberCount: m.league._count.members,
        myRank: higherCount + 1,
        myPoints,
        jerseyConfig: team && "jerseyConfig" in team ? team.jerseyConfig : null,
      };
    })
  );

  return <LeaguesView initialLeagues={leagues} mode={mode} />;
}
