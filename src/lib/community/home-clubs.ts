// Agrégation « D'où viennent les managers » — ARCHITECTURE.md §23.7.
// Ne renvoie QUE des comptes (jamais « X joue à Y »), et seulement pour les clubs
// VÉRIFIÉS. Consommé par le widget « Carte des managers » du dashboard
// (src/components/dashboard/widgets/HomeClubsMapWidget.tsx).
//
// ⚠️ Ce module est importé par un composant client (`abroadLabel`) : PAS d'import
// Prisma ici. La requête vit dans `home-clubs-query.ts` (serveur uniquement).
import { isInMetropolitanFrance } from "@/lib/geo/france-map";
import { countryName } from "@/lib/geo/countries";

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

export interface AbroadGroup {
  key: string;
  count: number;
}

export interface HomeClubsAggregate {
  totals: { members: number; clubs: number; departments: number };
  metropolitan: DepartmentPoint[];
  abroad: AbroadGroup[]; // pays étrangers + "OUTRE_MER", triés par count décroissant
  unlocated: number; // membres FR sans coordonnées exploitables
}

const OVERSEAS_KEY = "OUTRE_MER";

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
  const abroad = new Map<string, number>();
  let unlocated = 0;

  for (const r of rows) {
    const inMetro =
      r.latitude != null &&
      r.longitude != null &&
      r.country === "FR" &&
      isInMetropolitanFrance(r.longitude, r.latitude);

    if (inMetro) {
      const dept = departmentFromZipcode(r.zipcode) ?? "??";
      const cur = byDept.get(dept) ?? { count: 0, sumLon: 0, sumLat: 0, clubs: new Map<string, DepartmentClub>() };
      cur.count += 1;
      cur.sumLon += r.longitude as number;
      cur.sumLat += r.latitude as number;
      const club = cur.clubs.get(r.clubId) ?? { name: r.clubName, city: r.clubCity, count: 0 };
      club.count += 1;
      cur.clubs.set(r.clubId, club);
      byDept.set(dept, cur);
      continue;
    }

    if (r.country === "FR") {
      const dept2 = (r.zipcode ?? "").trim().slice(0, 2);
      if (dept2 === "97" || dept2 === "98") {
        abroad.set(OVERSEAS_KEY, (abroad.get(OVERSEAS_KEY) ?? 0) + 1);
      } else {
        unlocated += 1;
      }
      continue;
    }

    abroad.set(r.country, (abroad.get(r.country) ?? 0) + 1);
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

  const abroadGroups: AbroadGroup[] = [...abroad.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totals: {
      members: rows.length,
      clubs: distinctClubs.size,
      departments: metropolitan.filter((d) => d.dept !== "??").length,
    },
    metropolitan,
    abroad: abroadGroups,
    unlocated,
  };
}

/** Libellé affichable d'un groupe "abroad" (pays localisé, ou « Outre-mer »). */
export function abroadLabel(key: string, locale: string, overseasLabel: string): string {
  return key === OVERSEAS_KEY ? overseasLabel : countryName(key, locale);
}
