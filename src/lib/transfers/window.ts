// Statut des fenêtres de transfert — fonctions PURES, aucun import Prisma.
// Les dates des fenêtres sont saisies par l'admin (modèle TransferWindow).
// Deux modes de vérification car le jeu live avance en temps réel (deadline =
// horaire réel) alors que le Mode Simulation avance à la demande de l'utilisateur
// (aucune notion de "maintenant" pertinente) — voir memory simulation_mode.md.

export interface TransferWindowRange {
  opensAt: Date;
  closesAt: Date;
}

/** Jeu en direct : la fenêtre est ouverte si l'horaire courant est dans l'intervalle. */
export function isLiveTransferWindowOpen(window: TransferWindowRange, now: Date): boolean {
  return now >= window.opensAt && now <= window.closesAt;
}

export interface SimulationGameweekRef {
  number: number;
  deadlineAt: Date;
}

/**
 * Mode Simulation : la fenêtre est ouverte pour une équipe dès qu'elle a dépassé
 * toutes les journées programmées avant `opensAt`, et tant qu'elle n'a pas encore
 * atteint la première journée programmée après `closesAt`.
 *
 * Concrètement : `lastBefore` = dernière journée dont le deadline est strictement
 * avant `opensAt` (0 si aucune) ; `firstAfter` = première journée dont le deadline
 * est strictement après `closesAt` (+∞ si aucune). Ouverte ⟺
 * lastBefore.number ≤ currentGameweekNumber < firstAfter.number.
 */
export function isSimulationTransferWindowOpen(
  window: TransferWindowRange,
  gameweeks: SimulationGameweekRef[],
  currentGameweekNumber: number,
): boolean {
  const sorted = [...gameweeks].sort((a, b) => a.number - b.number);

  let lastBeforeNumber = 0;
  let firstAfterNumber = Infinity;

  for (const gw of sorted) {
    if (gw.deadlineAt < window.opensAt) {
      lastBeforeNumber = Math.max(lastBeforeNumber, gw.number);
    }
    if (gw.deadlineAt > window.closesAt && gw.number < firstAfterNumber) {
      firstAfterNumber = gw.number;
    }
  }

  return currentGameweekNumber >= lastBeforeNumber && currentGameweekNumber < firstAfterNumber;
}
