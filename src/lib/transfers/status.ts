// Statut des fenêtres de transfert pour une saison — orchestration Prisma autour
// des prédicats purs de src/lib/transfers/window.ts. Deux variantes (comme le
// reste du pipeline live/simulation) car la notion de "fenêtre ouverte" diffère :
// le jeu en direct compare à l'horloge réelle, le Mode Simulation à la progression
// dans le calendrier historique.
import { prisma } from "@/lib/db";
import { isLiveTransferWindowOpen, isSimulationTransferWindowOpen } from "./window";

export async function isLiveTransferWindowOpenForSeason(seasonId: string, now = new Date()): Promise<boolean> {
  const windows = await prisma.transferWindow.findMany({ where: { seasonId } });
  return windows.some((w) => isLiveTransferWindowOpen(w, now));
}

// Lit Season.currentSimulationGameweekNumber (curseur global, avancé uniquement par
// un admin — voir src/lib/simulation/admin-advance.ts) plutôt qu'un compteur par
// équipe : depuis la fusion live/simulation, toutes les équipes d'une même saison
// simulée avancent ensemble, donc la fenêtre est la même pour tout le monde.
export async function isSimulationTransferWindowOpenForSeason(seasonId: string): Promise<boolean> {
  const [windows, gameweeks, season] = await Promise.all([
    prisma.transferWindow.findMany({ where: { seasonId } }),
    prisma.gameweek.findMany({ where: { seasonId }, select: { number: true, deadlineAt: true } }),
    prisma.season.findUniqueOrThrow({ where: { id: seasonId }, select: { currentSimulationGameweekNumber: true } }),
  ]);
  return windows.some((w) => isSimulationTransferWindowOpen(w, gameweeks, season.currentSimulationGameweekNumber));
}
