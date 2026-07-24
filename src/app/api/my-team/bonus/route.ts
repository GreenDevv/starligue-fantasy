export const dynamic = "force-dynamic";

// PUT /api/my-team/bonus — choisit le bonus de saison actif pour la prochaine
// journée non verrouillée (Triple Capitaine, Bench Boost, Assurance, Statisticien).
// Au plus un bonus actif par journée (le champ pendingBonus est singulier) ; chaque
// type utilisable au maximum une fois par saison (voir FantasyBonusUsage /
// SimulationBonusUsage), avec un quota global de SEASON_BONUS_QUOTA_PER_SEASON
// activations sur les 4 types (un joueur doit en sacrifier un). Même contrôle de
// deadline que PUT /api/my-team/lineup, puisque le bonus est snapshoté avec
// l'alignement à la même deadline. type: null désarme le bonus en attente sans le
// consommer (ne compte jamais dans le quota).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { isLineupEditLocked } from "@/lib/transfers/deadline";

const bodySchema = z.object({
  type: z.enum(["TRIPLE_CAPTAIN", "BENCH_BOOST", "INSURANCE", "STATISTICIAN"]).nullable(),
  leagueId: z.string().cuid().optional(),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Connexion requise" } },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }
  const { type } = parsed.data;
  const userId = session.user.id;
  const mode = resolveSeasonMode();

  const ctx = await resolveActiveTeamContext(userId, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: ctx.teamId },
          include: { bonusUsages: { select: { type: true } } },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: ctx.teamId },
          include: { bonusUsages: { select: { type: true } } },
        });

  if (!team) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Équipe introuvable" } },
      { status: 404 }
    );
  }

  if (!team.isValidated) {
    return NextResponse.json(
      { error: { code: "SQUAD_NOT_VALIDATED", message: "Effectif non validé" } },
      { status: 400 }
    );
  }

  // Contrôle de deadline serveur — même règle que l'alignement (le bonus est
  // snapshoté en même temps que le lineup).
  const now = new Date();
  const activeGameweek = await prisma.gameweek.findFirst({
    where: { seasonId: ctx.seasonId, deadlineAt: { lte: now }, isScored: false },
    orderBy: { number: "asc" },
  });

  if (isLineupEditLocked(mode, activeGameweek !== null)) {
    return NextResponse.json(
      {
        error: {
          code: "DEADLINE_PASSED",
          message: `La deadline de la journée ${activeGameweek!.number} est passée`,
        },
      },
      { status: 400 }
    );
  }

  if (type !== null && team.bonusUsages.some((u) => u.type === type)) {
    return NextResponse.json(
      {
        error: {
          code: "BONUS_ALREADY_USED",
          message: "Ce bonus a déjà été utilisé cette saison",
        },
      },
      { status: 400 }
    );
  }

  // Quota global : 4 types possibles mais un nombre d'activations limité sur la
  // saison (voir GameConfig SEASON_BONUS_QUOTA_PER_SEASON) — ne s'applique qu'à
  // l'activation d'un type JAMAIS utilisé (désarmer avec type: null, ou changer
  // pour un type déjà utilisé — impossible de toute façon — ne consomme rien).
  if (type !== null) {
    const quotaConfig = await prisma.gameConfig.findUnique({ where: { key: "SEASON_BONUS_QUOTA_PER_SEASON" } });
    const quota = quotaConfig ? parseInt(quotaConfig.value, 10) : 3;
    if (team.bonusUsages.length >= quota) {
      return NextResponse.json(
        {
          error: {
            code: "BONUS_QUOTA_REACHED",
            message: `Quota de ${quota} bonus atteint pour cette saison`,
          },
        },
        { status: 400 }
      );
    }
  }

  if (mode === "simulation") {
    await prisma.simulationTeam.update({ where: { id: team.id }, data: { pendingBonus: type } });
  } else {
    await prisma.fantasyTeam.update({ where: { id: team.id }, data: { pendingBonus: type } });
  }

  return NextResponse.json({ data: { pendingBonus: type } });
}