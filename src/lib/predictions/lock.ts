// Verrouillage d'un pronostic avant le coup d'envoi — ARCHITECTURE.md §14.1.
// Fonction PURE : aucun effet de bord, aucun import Prisma.

/** Horaire à partir duquel un match n'est plus pronostiquable. */
export function predictionLockAt(kickoffAt: Date, lockMinutesBeforeKickoff: number): Date {
  return new Date(kickoffAt.getTime() - lockMinutesBeforeKickoff * 60_000);
}

/** Un match est verrouillé dès qu'on entre dans la fenêtre de X minutes avant le coup d'envoi. */
export function isMatchLocked(kickoffAt: Date, lockMinutesBeforeKickoff: number, now: Date): boolean {
  return predictionLockAt(kickoffAt, lockMinutesBeforeKickoff) <= now;
}
