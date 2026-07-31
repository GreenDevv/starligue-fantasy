// Résout les clubs "réellement en Daikin StarLigue cette saison" — la table Club
// est globale (partagée avec le Mode Simulation, cf. src/lib/simulation/setup.ts),
// donc contient aussi d'anciens clubs relégués (ex: Dijon/GDH, Istres/IPH, présents
// pour la saison 2025/26 simulée mais pas 2026/27) qui n'ont ni logo à jour ni
// raison d'être comptés comme "club Starligue" pour une feature de la saison en
// direct (Warm Up notamment, src/lib/ingestion/warmup.ts). Un club a un effectif
// (Player) pour la saison active si et seulement s'il joue vraiment cette saison —
// bien plus fiable que "existe dans la table Club".
import { prisma } from "@/lib/db";

/** slug lnh.fr (Club.externalIds.lnh) → clubId, pour les clubs ayant un effectif la saison donnée. */
export async function getActiveClubIdBySlug(seasonId: string): Promise<Map<string, string>> {
  const clubs = await prisma.club.findMany({
    where: { players: { some: { seasonId } } },
    select: { id: true, externalIds: true },
  });

  const map = new Map<string, string>();
  for (const c of clubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) map.set(extIds.lnh.toLowerCase(), c.id);
  }
  return map;
}
