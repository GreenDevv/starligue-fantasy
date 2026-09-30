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
