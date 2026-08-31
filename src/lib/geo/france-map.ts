// Fenêtre géographique métropole + Corse — sert à distinguer un club
// métropolitain d'un club DROM/étranger pour la carte « D'où viennent les
// managers » (ARCHITECTURE.md §23.7, src/components/dashboard/widgets/HomeClubsMapWidget.tsx).
// Le rendu carte lui-même est une vraie carte Leaflet (tuiles OSM), plus de
// contour dessiné à la main ici.
export interface LonLatBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export const METRO_FRANCE_BOUNDS: LonLatBounds = {
  lonMin: -5.2,
  lonMax: 9.7,
  latMin: 41.3,
  latMax: 51.1,
};

/** Vrai si (lon, lat) tombe dans la fenêtre métropole+Corse (hors-cadre = DROM/étranger). */
export function isInMetropolitanFrance(lon: number, lat: number): boolean {
  return (
    lon >= METRO_FRANCE_BOUNDS.lonMin &&
    lon <= METRO_FRANCE_BOUNDS.lonMax &&
    lat >= METRO_FRANCE_BOUNDS.latMin &&
    lat <= METRO_FRANCE_BOUNDS.latMax
  );
}
