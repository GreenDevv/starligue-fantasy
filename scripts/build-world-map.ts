// Régénère src/lib/geo/world-map.ts (WORLD_LAND_RINGS) depuis Natural Earth.
//
//   npx tsx scripts/build-world-map.ts
//
// Source : Natural Earth 1:110m « land » (domaine public). On simplifie
// agressivement (Douglas–Peucker) : la carte est un repère visuel grossier, pas
// un fond précis. Antarctique et petites îles retirés.
import { writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const OUT = "src/lib/geo/world-map.ts";
const EPSILON = 0.7; // degrés
const MIN_AREA = 3; // degrés²
const MIN_LAT = -56; // on jette tout ce qui est plus au sud (Antarctique)

type Pt = [number, number];

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0]!;
  const [bx, by] = pts[pts.length - 1]!;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-9;
  let dmax = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > eps) {
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  }
  return [pts[0]!, pts[pts.length - 1]!];
}

function simplifyRing(ring: Pt[], eps: number): Pt[] {
  const p0 = ring[0]!;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]!;
    const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  return rdp(ring.slice(0, far + 1), eps).slice(0, -1).concat(rdp(ring.slice(far), eps));
}

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const pj = r[j]!;
    const pi = r[i]!;
    a += pj[0] * pi[1] - pi[0] * pj[1];
  }
  return Math.abs(a / 2);
}

async function main() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`${SRC} → ${res.status}`);
  const geo = (await res.json()) as { features: { geometry: { coordinates: Pt[][] } }[] };

  const rings: Pt[][] = [];
  for (const f of geo.features) {
    const ext = f.geometry.coordinates[0];
    if (!ext) continue;
    let maxLat = -90;
    for (const [, y] of ext) if (y > maxLat) maxLat = y;
    if (maxLat < MIN_LAT) continue;
    if (ringArea(ext) < MIN_AREA) continue;
    const s = simplifyRing(ext, EPSILON);
    if (s.length >= 4) {
      rings.push(s.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Pt));
    }
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  const points = rings.reduce((n, r) => n + r.length, 0);

  const file = `// Contour des terres émergées (monde) pour la vue « monde » du widget
// « D'où viennent les managers » — ARCHITECTURE.md §23.7. SVG inline, aucune
// dépendance cartographique (même parti-pris que france-map.ts).
//
// Source : Natural Earth 1:110m « land » (domaine public), simplifié
// (Douglas–Peucker ε≈${EPSILON}°, îles < ${MIN_AREA}°² et Antarctique retirés) via
// scripts/build-world-map.ts — ${rings.length} anneaux / ${points} points, repère visuel grossier.
// [lon, lat], comme METRO_FRANCE_RING.

export const WORLD_LAND_RINGS: readonly (readonly [number, number][])[] = ${JSON.stringify(rings)};
`;
  writeFileSync(OUT, file);
  console.log(`${OUT} — ${rings.length} anneaux, ${points} points`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
