// Carte de France métropolitaine (+ Corse) pour le widget « D'où viennent les
// managers » — ARCHITECTURE.md §23.7. SVG inline, aucune dépendance
// cartographique : la projection est partagée avec la vue monde
// (map-projection.ts) — le contour ET les points sont dessinés avec la MÊME
// projection, seule façon de garantir qu'ils s'alignent.
//
// Contour volontairement grossier (~50 points) : repère visuel, pas un fond de
// carte précis. Corse incluse comme anneau séparé.
import {
  makeEquirectProjector,
  type LonLatBounds,
  type MapProjector,
} from "@/lib/geo/map-projection";

// Fenêtre géographique métropole + Corse — figée, sert au calage ET de zoom
// minimum de la vue monde (on ne dézoome jamais plus serré que ça).
export const METRO_FRANCE_BOUNDS: LonLatBounds = {
  lonMin: -5.2,
  lonMax: 9.7,
  latMin: 41.3,
  latMax: 51.1,
};

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

/** Projecteur calé sur métropole + Corse. */
export function makeFranceProjector(width: number, height: number, pad = 4): MapProjector {
  return makeEquirectProjector(METRO_FRANCE_BOUNDS, width, height, pad);
}

/** Vrai si (lon, lat) tombe dans la fenêtre métropole+Corse (hors-cadre = DROM/étranger). */
export function isInMetropolitanFrance(lon: number, lat: number): boolean {
  return (
    lon >= METRO_FRANCE_BOUNDS.lonMin &&
    lon <= METRO_FRANCE_BOUNDS.lonMax &&
    lat >= METRO_FRANCE_BOUNDS.latMin &&
    lat <= METRO_FRANCE_BOUNDS.latMax
  );
}
