// Fonctions pures autour du token de réinitialisation de mot de passe —
// ARCHITECTURE.md §6.1. La génération du token brut (aléatoire) reste dans la
// route (effet de bord), tout le reste est testable sans Prisma ni horloge
// système.
import { createHash } from "crypto";

export const RESET_TOKEN_TTL_MINUTES = 60;

/** sha256 du token brut — c'est ce hash qui est stocké/recherché en base, jamais le token lui-même. */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function computeResetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

export function isResetTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
