// Récap "qu'est-ce qu'il me reste à faire avant la deadline ?" affiché en haut
// de /team (jeu en direct uniquement — Prediction est lié à FantasyTeam, pas
// SimulationTeam ; la simulation n'a pas de deadline joueur).
//
// Volontairement minimal : l'effectif et le capitaine sont déjà garantis quand
// on atteint /team (redirections de la page), donc le seul vrai "à faire"
// souvent oublié = les pronostics de la journée. Le compte à rebours et le
// choix du bonus vivent aussi ici pour regrouper toutes les décisions de
// journée au même endroit (le <DeadlineBanner> global pointe vers /team).
import { prisma } from "@/lib/db";

export interface GameweekChecklist {
  gameweekNumber: number;
  deadlineAt: string; // ISO
  // null = aucun marché de pronostic pour cette journée (rien à faire)
  predictions: { made: number; total: number } | null;
}

export async function getGameweekChecklist(
  seasonId: string,
  fantasyTeamId: string,
  now: Date = new Date()
): Promise<GameweekChecklist | null> {
  const gameweek = await prisma.gameweek.findFirst({
    where: { seasonId, deadlineAt: { gt: now } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, deadlineAt: true },
  });
  if (!gameweek) return null;

  const markets = await prisma.predictionMarket.findMany({
    where: { match: { gameweekId: gameweek.id } },
    select: { id: true },
  });

  let predictions: GameweekChecklist["predictions"] = null;
  if (markets.length > 0) {
    const made = await prisma.prediction.count({
      where: { fantasyTeamId, marketId: { in: markets.map((m) => m.id) } },
    });
    predictions = { made, total: markets.length };
  }

  return {
    gameweekNumber: gameweek.number,
    deadlineAt: gameweek.deadlineAt.toISOString(),
    predictions,
  };
}
