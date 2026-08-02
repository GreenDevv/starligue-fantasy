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

// slug lnh.fr + nom complet, pour les clubs ayant un effectif la saison donnée —
// utilisé par src/lib/data-providers/ehf-scraper.provider.ts (coupes d'Europe EHF)
// pour retrouver le club Starligue correspondant à un nom d'équipe EHF par
// correspondance de nom (l'API EHF n'expose aucun identifiant partagé avec lnh.fr,
// contrairement au calendrier global lnh.fr dont les slugs sont directement
// exploitables). Distinct de getActiveClubIdBySlug (qui ne sert que lnh.fr) pour ne
// pas alourdir son usage principal d'un select inutile.
export async function getActiveClubSlugsAndNames(seasonId: string): Promise<{ slug: string; name: string }[]> {
  const clubs = await prisma.club.findMany({
    where: { players: { some: { seasonId } } },
    select: { name: true, externalIds: true },
  });

  return clubs
    .map((c) => ({ slug: ((c.externalIds as Record<string, string>) ?? {}).lnh ?? null, name: c.name }))
    .filter((c): c is { slug: string; name: string } => c.slug !== null);
}
