// totalPoints d'une équipe fantasy (LIVE) = Σ(FantasyLineup.points) − pointsConverted.
//
// La conversion points → budget (src/lib/budget/points-conversion.ts) retire
// définitivement des points du classement, et doit survivre à un recompute de
// journée qui recalcule tout depuis la table FantasyLineup — d'où la soustraction
// de `pointsConverted` ici plutôt qu'un decrement ponctuel.
//
// Les lignes "points d'accueil" (FantasyLineup.isCatchup, §13.7) ont un `points`
// non-null et sont donc incluses dans la somme sans traitement particulier.
//
// Module séparé de compute.ts pour être appelable aussi depuis
// recompute-catchup.ts sans import circulaire.
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";

export async function recalcTotalPoints(fantasyTeamId: string): Promise<void> {
  const [lineups, team] = await Promise.all([
    prisma.fantasyLineup.findMany({
      where: { fantasyTeamId, points: { not: null } },
      select: { points: true },
    }),
    prisma.fantasyTeam.findUniqueOrThrow({
      where: { id: fantasyTeamId },
      select: { pointsConverted: true },
    }),
  ]);
  const rawTotal = lineups.reduce((s, l) => s + Number(l.points ?? 0), 0);
  const total = rawTotal - Number(team.pointsConverted);
  await prisma.fantasyTeam.update({
    where: { id: fantasyTeamId },
    data: { totalPoints: new Decimal(Math.round(total * 10) / 10) },
  });
}
