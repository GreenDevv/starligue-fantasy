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

// Répartition par club à l'intérieur d'un département — sert le survol de la
// carte (« quels clubs derrière ce point ? »), trié par nb de managers puis nom.
export interface DepartmentClub {
  name: string;
  city: string | null;
  count: number;
}

export interface DepartmentPoint {
  dept: string; // code à 2 chiffres
  count: number; // nombre de managers
  lon: number; // moyenne des clubs du département
  lat: number;
  clubs: DepartmentClub[];
}

// Club hors métropole (DROM ou étranger) qui a des coordonnées → point placé
// individuellement sur la vue monde de la carte.
export interface OverseasPoint {
  clubId: string;
  name: string;
  city: string | null;
  country: string; // ISO 3166-1 alpha-2
  lon: number;
  lat: number;
  count: number; // nombre de managers
}

export interface HomeClubsAggregate {
  totals: { members: number; clubs: number; departments: number };
  metropolitan: DepartmentPoint[];
  overseas: OverseasPoint[]; // clubs hors métropole avec coordonnées
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

export function aggregateHomeClubs(rows: HomeClubMemberRow[]): HomeClubsAggregate {
  const distinctClubs = new Set(rows.map((r) => r.clubId));

  const byDept = new Map<
    string,
    { count: number; sumLon: number; sumLat: number; clubs: Map<string, DepartmentClub> }
  >();
  const overseasByClub = new Map<string, OverseasPoint>();
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
      const dept = departmentFromZipcode(r.zipcode) ?? "??";
      const cur = byDept.get(dept) ?? { count: 0, sumLon: 0, sumLat: 0, clubs: new Map<string, DepartmentClub>() };
      cur.count += 1;
      cur.sumLon += lon;
      cur.sumLat += lat;
      const club = cur.clubs.get(r.clubId) ?? { name: r.clubName, city: r.clubCity, count: 0 };
      club.count += 1;
      cur.clubs.set(r.clubId, club);
      byDept.set(dept, cur);
      continue;
    }

    const cur =
      overseasByClub.get(r.clubId) ??
      { clubId: r.clubId, name: r.clubName, city: r.clubCity, country: r.country, lon, lat, count: 0 };
    cur.count += 1;
    overseasByClub.set(r.clubId, cur);
  }

  const metropolitan: DepartmentPoint[] = [...byDept.entries()]
    .map(([dept, v]) => ({
      dept,
      count: v.count,
      lon: v.sumLon / v.count,
      lat: v.sumLat / v.count,
      clubs: [...v.clubs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count);

  const overseas: OverseasPoint[] = [...overseasByClub.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  return {
    totals: {
      members: rows.length,
      clubs: distinctClubs.size,
      departments: metropolitan.filter((d) => d.dept !== "??").length,
    },
    metropolitan,
    overseas,
    unlocated,
  };
}

/** Regroupe les points hors métropole par pays (pour la légende du widget). */
export function groupOverseasByCountry(overseas: OverseasPoint[]): { country: string; count: number }[] {
  const byCountry = new Map<string, number>();
  for (const p of overseas) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + p.count);
  return [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}
