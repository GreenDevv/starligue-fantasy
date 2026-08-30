// Projection équirectangulaire (corrigée par cos(latitude médiane)) partagée par
// la carte de France (france-map.ts) et la vue monde du widget « D'où viennent
// les managers » — ARCHITECTURE.md §23.7. Aucune dépendance cartographique : on
// projette nous-mêmes (lon, lat) → repère SVG, et on dessine le contour ET les
// points avec LA MÊME projection, seule façon de garantir qu'ils s'alignent.

export interface LonLatBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export interface MapProjector {
  width: number;
  height: number;
  project: (lon: number, lat: number) => { x: number; y: number };
  ringPath: (ring: readonly (readonly [number, number])[]) => string;
}

/**
 * Projecteur équirectangulaire calé sur `bounds`, centré dans un cadre
 * `width`×`height` avec une marge `pad`. Longitude corrigée par cos(lat médiane)
 * pour que les proportions restent correctes à la latitude de la zone affichée.
 */
export function makeEquirectProjector(
  bounds: LonLatBounds,
  width: number,
  height: number,
  pad = 4,
): MapProjector {
  const latMidRad = ((bounds.latMin + bounds.latMax) / 2) * (Math.PI / 180);
  const cosLatMid = Math.max(Math.cos(latMidRad), 0.1);
  const uSpan = (bounds.lonMax - bounds.lonMin) * cosLatMid;
  const vSpan = bounds.latMax - bounds.latMin;
  const scale = Math.min((width - 2 * pad) / uSpan, (height - 2 * pad) / vSpan);
  const offsetX = (width - uSpan * scale) / 2;
  const offsetY = (height - vSpan * scale) / 2;

  function project(lon: number, lat: number) {
    const u = (lon - bounds.lonMin) * cosLatMid;
    const v = bounds.latMax - lat; // latitude vers le bas
    return { x: offsetX + u * scale, y: offsetY + v * scale };
  }

  function ringPath(ring: readonly (readonly [number, number])[]) {
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

/** Rectangle englobant d'un nuage de points, ou `null` si vide. */
export function boundsOfPoints(points: readonly { lon: number; lat: number }[]): LonLatBounds | null {
  if (points.length === 0) return null;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const p of points) {
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
  }
  return { lonMin, lonMax, latMin, latMax };
}

/** Étend des bornes d'un facteur (marge) et garantit une taille minimale. */
export function padBounds(
  b: LonLatBounds,
  factor: number,
  minSpanLon: number,
  minSpanLat: number,
): LonLatBounds {
  const lonSpan = Math.max(b.lonMax - b.lonMin, minSpanLon);
  const latSpan = Math.max(b.latMax - b.latMin, minSpanLat);
  const cx = (b.lonMin + b.lonMax) / 2;
  const cy = (b.latMin + b.latMax) / 2;
  const hw = (lonSpan / 2) * (1 + factor);
  const hh = (latSpan / 2) * (1 + factor);
  return { lonMin: cx - hw, lonMax: cx + hw, latMin: cy - hh, latMax: cy + hh };
}

/** Plus petit rectangle contenant `a` et `b`. */
export function unionBounds(a: LonLatBounds, b: LonLatBounds): LonLatBounds {
  return {
    lonMin: Math.min(a.lonMin, b.lonMin),
    lonMax: Math.max(a.lonMax, b.lonMax),
    latMin: Math.min(a.latMin, b.latMin),
    latMax: Math.max(a.latMax, b.latMax),
  };
}

/** Restreint des bornes à ne jamais déborder de `clamp` (typiquement le monde). */
export function clampBounds(b: LonLatBounds, clamp: LonLatBounds): LonLatBounds {
  return {
    lonMin: Math.max(b.lonMin, clamp.lonMin),
    lonMax: Math.min(b.lonMax, clamp.lonMax),
    latMin: Math.max(b.latMin, clamp.latMin),
    latMax: Math.min(b.latMax, clamp.latMax),
  };
}

export const WORLD_BOUNDS: LonLatBounds = { lonMin: -180, lonMax: 180, latMin: -58, latMax: 84 };
