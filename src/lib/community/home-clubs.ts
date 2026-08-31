// Agrégation « D'où viennent les managers » — ARCHITECTURE.md §23.7.
// Ne renvoie QUE des comptes (jamais « X joue à Y »), et seulement pour les clubs
// VÉRIFIÉS. Consommé par le widget « Carte des managers » du dashboard
// (src/components/dashboard/widgets/HomeClubsMapWidget.tsx).
//
// ⚠️ Ce module est importé par un composant client : PAS d'import Prisma ici.
// La requête vit dans `home-clubs-query.ts` (serveur uniquement).
import { isInMetropolitanFrance } from "@/lib/geo/france-map";

export interface HomeClubMemberRow {
  clubId: string;
  clubName: string;
  clubCity: string | null;
  country: string;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Un point par club (coordonnées exactes du club, pas de moyenne) — la carte
// Leaflet regroupe elle-même les points proches selon le niveau de zoom, donc
// pas besoin de pré-agréger par département comme avant.
export interface ClubPoint {
  clubId: string;
  name: string;
  city: string | null;
  country: string; // ISO 3166-1 alpha-2
  lon: number;
  lat: number;
  count: number; // nombre de managers pour ce club
}

export interface HomeClubsAggregate {
  totals: { members: number; clubs: number; departments: number };
  points: ClubPoint[]; // tous les clubs avec coordonnées (métropole + hors métropole)
  unlocated: number; // membres dont le club n'a aucune coordonnée (tout pays)
}

/** Département métropolitain à 2 chiffres depuis un code postal, ou null. */
export function departmentFromZipcode(zipcode: string | null): string | null {
  if (!zipcode) return null;
  const m = zipcode.trim().match(/^(\d{2})\d{3}$/);
  if (!m) return null;
  const dd = m[1] as string;
  if (dd === "97" || dd === "98") return null; // DROM-COM → traité comme outre-mer
  return dd;
}

/** Un point est « hors métropole » (DROM ou étranger) — sert à la légende sous la carte. */
export function isOverseasPoint(p: Pick<ClubPoint, "country" | "lon" | "lat">): boolean {
  return !(p.country === "FR" && isInMetropolitanFrance(p.lon, p.lat));
}

export function aggregateHomeClubs(rows: HomeClubMemberRow[]): HomeClubsAggregate {
  const byClub = new Map<string, ClubPoint>();
  const departments = new Set<string>();
  let unlocated = 0;

  for (const r of rows) {
    const hasCoords = r.latitude != null && r.longitude != null;
    if (!hasCoords) {
      unlocated += 1;
      continue;
    }
    const lon = r.longitude as number;
    const lat = r.latitude as number;

    if (r.country === "FR" && isInMetropolitanFrance(lon, lat)) {
      const dept = departmentFromZipcode(r.zipcode);
      if (dept) departments.add(dept);
    }

    const cur = byClub.get(r.clubId) ?? { clubId: r.clubId, name: r.clubName, city: r.clubCity, country: r.country, lon, lat, count: 0 };
    cur.count += 1;
    byClub.set(r.clubId, cur);
  }

  const points: ClubPoint[] = [...byClub.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  return {
    totals: { members: rows.length, clubs: byClub.size, departments: departments.size },
    points,
    unlocated,
  };
}

/** Regroupe les points hors métropole par pays (pour la légende du widget). */
export function groupOverseasByCountry(points: ClubPoint[]): { country: string; count: number }[] {
  const byCountry = new Map<string, number>();
  for (const p of points) {
    if (!isOverseasPoint(p)) continue;
    byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + p.count);
  }
  return [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}
