export const dynamic = "force-dynamic";

// GET /api/leagues — mes ligues (du mode courant) + rang | POST /api/leagues — créer (+ équipe)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateUniqueInviteCode } from "@/lib/leagues/invite-code";
import { setActiveLeagueCookie } from "@/lib/team/active-league";
import { DEFAULT_JERSEY_CONFIG } from "@/lib/team/jersey";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userId = session.user.id;
  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);
  if (!season) {
    return NextResponse.json({ data: [] });
  }

  const memberships = await prisma.leagueMember.findMany({
    where: { userId, league: { seasonId: season.id } },
    include: {
      league: { include: { _count: { select: { members: true } } } },
    },
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
          ? await prisma.simulationTeam.count({
              where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } },
            })
          : await prisma.fantasyTeam.count({
              where: { leagueId: m.leagueId, totalPoints: { gt: myPoints } },
            });
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

  return NextResponse.json({ data: leagues });
}

const createSchema = z.object({ name: z.string().min(3).max(50) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const teamOwnerName = session.user.name ?? "Coach";
  const mode = resolveSeasonMode();
  const inviteCode = await generateUniqueInviteCode();

  const [config, season] = await Promise.all([
    prisma.gameConfig.findUnique({ where: { key: "INITIAL_BUDGET" } }),
    resolveModeSeason(mode),
  ]);
  const initialBudget = parseFloat(config?.value ?? process.env.INITIAL_BUDGET ?? "100.0");
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON" } }, { status: 400 });
  }

  const { league, teamId } = await prisma.$transaction(async (tx) => {
    const l = await tx.league.create({
      data: { name: parsed.data.name, inviteCode, ownerId: userId, seasonId: season.id },
    });
    await tx.leagueMember.create({ data: { leagueId: l.id, userId } });

    if (mode === "simulation") {
      const t = await tx.simulationTeam.create({
        data: { userId, seasonId: season.id, leagueId: l.id, name: `Équipe de ${teamOwnerName}`, budget: initialBudget },
      });
      return { league: l, teamId: t.id };
    }

    const t = await tx.fantasyTeam.create({
      data: {
        userId,
        leagueId: l.id,
        name: `Équipe de ${teamOwnerName}`,
        budget: initialBudget,
        jerseyConfig: DEFAULT_JERSEY_CONFIG,
      },
    });
    return { league: l, teamId: t.id };
  });

  const res = NextResponse.json(
    {
      data: {
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
        teamId,
      },
    },
    { status: 201 }
  );
  setActiveLeagueCookie(res, league.id);
  return res;
}