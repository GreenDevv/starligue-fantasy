// Points d'accueil (ARCHITECTURE.md §13.7) — orchestration effectful.
//
// (Re)calcule les lignes FantasyLineup.isCatchup pour toutes les équipes validées
// d'une saison LIVE. Idempotent : delete-puis-create, comme PlayerValueHistory —
// rejouable à chaque fin de journée notée (computeGameweekScores) ou à la
// validation d'un effectif (POST /api/my-team/squad), sans empiler de doublons.
//
// Une équipe qui a rejoint la ligue après la journée J n'a pas de FantasyLineup
// réel sur J (garde-fou validatedAt dans snapshot-lineups). On lui crée ici une
// ligne synthétique par journée notée manquée, créditée de la médiane globale des
// points réellement marqués cette journée-là × CATCHUP_FACTOR.
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import { recalcTotalPoints } from "./recalc-total-points";
import {
  computeCatchupCredit,
  firstEligibleGameweekNumber,
  parseCatchupConfig,
} from "./catchup";

export interface RecomputeCatchupResult {
  teamsWithCredits: number;
  creditRows: number;
}

export async function recomputeCatchupCredits(
  seasonId: string,
): Promise<RecomputeCatchupResult> {
  const rawConfig = Object.fromEntries(
    (await prisma.gameConfig.findMany()).map((c) => [c.key, c.value]),
  );
  const config = parseCatchupConfig(rawConfig);

  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId },
    select: { id: true, number: true, deadlineAt: true, isScored: true },
    orderBy: { number: "asc" },
  });
  const scoredGameweeks = gameweeks.filter((gw) => gw.isScored);

  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true, league: { seasonId } },
    select: { id: true, validatedAt: true, createdAt: true },
  });

  // Crédit par numéro de journée notée = médiane globale des points réels (toutes
  // ligues confondues, hors lignes d'accueil) × facteur.
  const creditByGwNumber = new Map<number, { gameweekId: string; credit: number }>();
  if (config.enabled) {
    for (const gw of scoredGameweeks) {
      const real = await prisma.fantasyLineup.findMany({
        where: { gameweekId: gw.id, isCatchup: false, points: { not: null } },
        select: { points: true },
      });
      if (real.length === 0) continue;
      creditByGwNumber.set(gw.number, {
        gameweekId: gw.id,
        credit: computeCatchupCredit(
          real.map((l) => Number(l.points)),
          config,
        ),
      });
    }
  }

  let teamsWithCredits = 0;
  let creditRows = 0;

  for (const team of teams) {
    const confirmedAt = team.validatedAt ?? team.createdAt;
    const firstEligible = firstEligibleGameweekNumber(gameweeks, confirmedAt);

    // firstEligible null = effectif confirmé après la dernière deadline connue :
    // l'équipe ne jouera aucune journée → pas d'accueil non plus (non-participante).
    const missedGwNumbers =
      config.enabled && firstEligible !== null
        ? scoredGameweeks
            .filter((gw) => gw.number < firstEligible)
            .map((gw) => gw.number)
        : [];

    // Ne jamais écraser un vrai lineup (ne devrait pas exister sur une journée
    // manquée, mais garde-fou).
    const realLineupGwIds = new Set(
      (
        await prisma.fantasyLineup.findMany({
          where: { fantasyTeamId: team.id, isCatchup: false },
          select: { gameweekId: true },
        })
      ).map((l) => l.gameweekId),
    );

    const desired = missedGwNumbers
      .map((n) => creditByGwNumber.get(n))
      .filter((c): c is { gameweekId: string; credit: number } => c !== undefined)
      .filter((c) => !realLineupGwIds.has(c.gameweekId));

    await prisma.$transaction(async (tx) => {
      await tx.fantasyLineup.deleteMany({
        where: { fantasyTeamId: team.id, isCatchup: true },
      });
      if (desired.length > 0) {
        await tx.fantasyLineup.createMany({
          data: desired.map((c) => ({
            fantasyTeamId: team.id,
            gameweekId: c.gameweekId,
            entries: [],
            bonus: null,
            points: new Decimal(c.credit),
            isCatchup: true,
          })),
        });
      }
    });

    await recalcTotalPoints(team.id);

    if (desired.length > 0) {
      teamsWithCredits++;
      creditRows += desired.length;
    }
  }

  return { teamsWithCredits, creditRows };
}
