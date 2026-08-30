// Carte de France métropolitaine (+ Corse) pour le widget « D'où viennent les
// managers » — ARCHITECTURE.md §23.7 (lot 2). SVG inline, aucune dépendance
// cartographique : on projette nous-mêmes des coordonnées (lon, lat) vers le
// repère SVG, et on dessine le contour ET les points avec LA MÊME projection —
// c'est la seule façon de garantir qu'ils s'alignent.
//
// Contour volontairement grossier (~50 points) : il sert de repère visuel, pas de
// fond de carte précis. Corse incluse comme anneau séparé.

// Bornes géographiques (métropole + Corse) — figées, servent au calage.
const LON_MIN = -5.2;
const LON_MAX = 9.7;
const LAT_MIN = 41.3;
const LAT_MAX = 51.1;
const LAT_MID_RAD = ((LAT_MIN + LAT_MAX) / 2) * (Math.PI / 180);
const COS_LAT_MID = Math.cos(LAT_MID_RAD);

// Contour métropole, sens horaire depuis Dunkerque. [lon, lat].
export const METRO_FRANCE_RING: [number, number][] = [
  [2.37, 51.03], [3.15, 50.79], [4.23, 49.96], [5.47, 49.51], [6.37, 49.47],
  [7.63, 49.05], [8.23, 48.97], [7.58, 47.59], [7.0, 47.32], [6.87, 46.9],
  [6.1, 46.4], [6.06, 46.15], [6.8, 45.9], [7.0, 45.5], [6.63, 45.11],
  [6.9, 44.85], [7.72, 44.17], [7.53, 43.78], [6.37, 43.12], [5.35, 43.31],
  [4.06, 43.4], [3.05, 42.99], [3.04, 42.47], [1.72, 42.5], [0.66, 42.69],
  [-0.55, 42.8], [-1.79, 43.35], [-1.25, 44.55], [-1.06, 45.57], [-1.25, 46.32],
  [-2.05, 47.03], [-2.55, 47.5], [-3.13, 47.48], [-4.32, 47.8], [-4.79, 48.09],
  [-4.5, 48.4], [-3.55, 48.83], [-2.02, 48.65], [-1.57, 48.64], [-1.85, 49.72],
  [-1.28, 49.68], [-0.24, 49.29], [0.22, 49.5], [1.62, 50.13], [1.57, 50.86],
  [2.37, 51.03],
];

// Corse, sens horaire depuis le Cap Corse. [lon, lat].
export const CORSICA_RING: [number, number][] = [
  [9.36, 43.0], [9.55, 42.62], [9.4, 42.28], [9.5, 41.85], [9.28, 41.36],
  [8.8, 41.56], [8.58, 41.94], [8.75, 42.27], [8.6, 42.36], [9.0, 42.68],
  [9.36, 43.0],
];

export interface FranceProjector {
  width: number;
  height: number;
  project: (lon: number, lat: number) => { x: number; y: number };
  ringPath: (ring: [number, number][]) => string;
}

/**
 * Construit un projecteur équirectangulaire (avec correction de longitude par
 * cos(latitude médiane)) calé sur les bornes métropole+Corse, centré dans un
 * cadre `width`×`height` avec une marge `pad`.
 */
export function makeFranceProjector(width: number, height: number, pad = 4): FranceProjector {
  const uSpan = (LON_MAX - LON_MIN) * COS_LAT_MID; // largeur "monde" corrigée
  const vSpan = LAT_MAX - LAT_MIN;
  const scale = Math.min((width - 2 * pad) / uSpan, (height - 2 * pad) / vSpan);
  const offsetX = (width - uSpan * scale) / 2;
  const offsetY = (height - vSpan * scale) / 2;

  function project(lon: number, lat: number) {
    const u = (lon - LON_MIN) * COS_LAT_MID;
    const v = LAT_MAX - lat; // latitude vers le bas
    return { x: offsetX + u * scale, y: offsetY + v * scale };
  }

  function ringPath(ring: [number, number][]) {
    return (
      ring
        .map(([lon, lat], i) => {
          const { x, y } = project(lon, lat);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ") + " Z"
    );
  }

  return { width, height, project, ringPath };
}

/** Vrai si (lon, lat) tombe dans la fenêtre métropole+Corse (points hors-cadre = DROM/étranger). */
export function isInMetropolitanFrance(lon: number, lat: number): boolean {
  return lon >= LON_MIN && lon <= LON_MAX && lat >= LAT_MIN && lat <= LAT_MAX;
}
