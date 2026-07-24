export const dynamic = "force-dynamic";

// POST /api/leagues/join — rejoindre via code d'invitation (+ crée l'équipe)
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveLeagueCookie } from "@/lib/team/active-league";
import { DEFAULT_JERSEY_CONFIG } from "@/lib/team/jersey";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

const bodySchema = z.object({ inviteCode: z.string().min(6).max(12) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const { inviteCode } = parsed.data;
  const mode = resolveSeasonMode();

  const league = await prisma.league.findUnique({
    where: { inviteCode },
    include: { _count: { select: { members: true } }, season: { select: { label: true } } },
  });

  if (!league) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Code d'invitation invalide" } },
      { status: 404 }
    );
  }

  const leagueMode = league.season.label === SIMULATION_SEASON_LABEL ? "simulation" : "live";
  if (leagueMode !== mode) {
    return NextResponse.json(
      {
        error: {
          code: "WRONG_SEASON_MODE",
          message:
            leagueMode === "simulation"
              ? "Cette ligue appartient à la Simulation 2025/26 — bascule le toggle de saison pour la rejoindre."
              : "Cette ligue appartient au jeu en direct 2026/27 — bascule le toggle de saison pour la rejoindre.",
        },
      },
      { status: 400 }
    );
  }

  if (league._count.members >= league.maxMembers) {
    return NextResponse.json(
      { error: { code: "LEAGUE_FULL", message: "La ligue est complète" } },
      { status: 400 }
    );
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: "ALREADY_MEMBER", message: "Tu es déjà membre de cette ligue" } },
      { status: 400 }
    );
  }

  const config = await prisma.gameConfig.findUnique({ where: { key: "INITIAL_BUDGET" } });
  const initialBudget = parseFloat(config?.value ?? process.env.INITIAL_BUDGET ?? "100.0");
  const teamOwnerName = session.user.name ?? "Coach";

  let teamId: string;
  try {
    teamId = await prisma.$transaction(async (tx) => {
      await tx.leagueMember.create({ data: { leagueId: league.id, userId } });

      if (mode === "simulation") {
        const t = await tx.simulationTeam.create({
          data: {
            userId,
            seasonId: league.seasonId,
            leagueId: league.id,
            name: `Équipe de ${teamOwnerName}`,
            budget: initialBudget,
          },
        });
        return t.id;
      }

      const t = await tx.fantasyTeam.create({
        data: {
          userId,
          leagueId: league.id,
          name: `Équipe de ${teamOwnerName}`,
          budget: initialBudget,
          jerseyConfig: DEFAULT_JERSEY_CONFIG,
        },
      });
      return t.id;
    });
  } catch (e) {
    // Race concurrente rare (double-tap) sur la contrainte unique leagueId+userId.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: { code: "ALREADY_MEMBER", message: "Tu es déjà membre de cette ligue" } },
        { status: 400 }
      );
    }
    throw e;
  }

  const res = NextResponse.json({ data: { leagueId: league.id, name: league.name, teamId } });
  setActiveLeagueCookie(res, league.id);
  return res;
}