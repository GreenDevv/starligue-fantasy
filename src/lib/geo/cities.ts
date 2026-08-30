// Annuaire mondial de villes (coordonnées) pour géolocaliser un club saisi
// librement — ARCHITECTURE.md §23. Snapshot GeoNames `cities15000` (villes de
// plus de ~15 000 habitants, ~34 k entrées), licence CC BY 4.0
// (https://www.geonames.org/), régénérable via `scripts/build-world-cities.ts`.
//
// SERVEUR UNIQUEMENT (lit un fichier + zlib). Consommé par `GET /api/geo/cities`
// et par `resolveHomeClubId` (src/lib/clubs/home-club-input.ts). Le fichier vit
// sous src/lib/geo/data : Railway lance `next start` (pas standalone), le repo
// entier est présent au runtime — cf. mémoire « déploiement Railway ».
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";

export interface City {
  name: string;
  admin1: string; // région/état (nom ASCII), "" si inconnu
  country: string; // ISO 3166-1 alpha-2
  latitude: number;
  longitude: number;
}

interface LoadedCity extends City {
  norm: string; // nom normalisé (minuscule, sans accents) pour la recherche
}

const DATA_PATH = path.join(process.cwd(), "src/lib/geo/data/world-cities.tsv.gz");

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

let cache: LoadedCity[] | null = null;

// Fichier trié par population décroissante à la génération : on garde cet ordre,
// il porte la pertinence (Paris avant Paris, Texas ; New York City en tête).
function load(): LoadedCity[] {
  if (cache) return cache;
  const tsv = gunzipSync(readFileSync(DATA_PATH)).toString("utf8");
  const rows: LoadedCity[] = [];
  for (const line of tsv.split("\n")) {
    if (!line) continue;
    const [name, admin1, country, lat, lon] = line.split("\t");
    if (!name || !country) continue;
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;
    rows.push({ name, admin1: admin1 ?? "", country, latitude, longitude, norm: normalize(name) });
  }
  cache = rows;
  return rows;
}

const strip = ({ norm: _norm, ...city }: LoadedCity): City => city;

/**
 * Recherche de villes par préfixe puis sous-chaîne (accents ignorés). Résultats
 * dans l'ordre du fichier (population décroissante), préfixes d'abord.
 */
export function searchCities(query: string, opts: { country?: string; limit?: number } = {}): City[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const country = opts.country?.toUpperCase();

  const prefix: City[] = [];
  const contains: City[] = [];
  for (const c of load()) {
    if (country && c.country !== country) continue;
    if (c.norm.startsWith(q)) prefix.push(strip(c));
    else if (c.norm.includes(q)) contains.push(strip(c));
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

/**
 * Coordonnées d'une ville nommée dans un pays donné (correspondance exacte du
 * nom, accents ignorés ; la plus peuplée gagne). `null` si rien ne correspond.
 */
export function geocodeCity(name: string, country: string): { latitude: number; longitude: number } | null {
  const n = normalize(name);
  const cc = country.toUpperCase();
  for (const c of load()) {
    if (c.country === cc && c.norm === n) return { latitude: c.latitude, longitude: c.longitude };
  }
  return null;
}
