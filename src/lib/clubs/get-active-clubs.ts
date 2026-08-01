// Clubs "réellement en Daikin StarLigue cette saison" — même filtre que
// getActiveClubIdBySlug (src/lib/clubs/get-active-club-slugs.ts) : un effectif
// (Player) pour la saison donnée, pas juste "existe dans la table Club" (globale,
// partagée avec le Mode Simulation, contient aussi d'anciens clubs relégués).
// Utilisé pour la bande de logos des 16 clubs sur la home.
import { prisma } from "@/lib/db";

export interface ActiveClub {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

export async function getActiveClubs(seasonId: string): Promise<ActiveClub[]> {
  return prisma.club.findMany({
    where: { players: { some: { seasonId } } },
    select: { id: true, name: true, shortName: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
}
