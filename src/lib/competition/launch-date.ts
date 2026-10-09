// Date de lancement affichée sur la page « bientôt » (ComingSoon) — ARCHITECTURE.md §35.
// NEXT_PUBLIC_LAUNCH_DATE="2026-10-10" (service LBE, lue au build) → « 10.10.26 ».
// Absente ou illisible → null : la page garde son badge « BIENTÔT ». Fonction PURE.

export function formatLaunchDate(iso: string | undefined): string | null {
  const m = iso?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(+y!, +mo! - 1, +d!));
  if (date.getUTCMonth() !== +mo! - 1 || date.getUTCDate() !== +d!) return null; // ex. 2026-02-30
  return `${d}.${mo}.${y!.slice(2)}`;
}

// Heure d'ouverture par défaut le jour J : 06:00 UTC = 08:00 à Paris (heure d'été,
// jusqu'au 25/10/2026). LAUNCH_AT (ISO complet, lue à l'exécution) la remplace.
const DEFAULT_LAUNCH_HOUR_UTC = "06:00:00Z";

/** Instant d'ouverture du jeu : LAUNCH_AT si lisible, sinon jour J à 06:00 UTC, sinon null. */
export function launchMoment(launchDate: string | undefined, launchAt: string | undefined): Date | null {
  const at = launchAt?.trim() ? new Date(launchAt.trim()) : null;
  if (at && !Number.isNaN(at.getTime())) return at;
  if (!formatLaunchDate(launchDate)) return null;
  return new Date(`${launchDate!.trim()}T${DEFAULT_LAUNCH_HOUR_UTC}`);
}

/**
 * Page « bientôt » affichée ? COMING_SOON=true la pose ; elle tombe d'elle-même à
 * l'instant d'ouverture (launchMoment), sans toucher aux variables Railway.
 * Sans date de lancement lisible, COMING_SOON=true reste en vigueur indéfiniment.
 */
export function isComingSoon(opts: {
  comingSoon: string | undefined;
  launchDate: string | undefined;
  launchAt: string | undefined;
  now: Date;
}): boolean {
  if (opts.comingSoon !== "true") return false;
  const moment = launchMoment(opts.launchDate, opts.launchAt);
  return moment === null || opts.now < moment;
}

/** Lecture des variables d'environnement du service (page d'accueil). */
export function isComingSoonNow(now: Date = new Date()): boolean {
  return isComingSoon({
    comingSoon: process.env.COMING_SOON,
    launchDate: process.env.NEXT_PUBLIC_LAUNCH_DATE,
    launchAt: process.env.LAUNCH_AT,
    now,
  });
}
