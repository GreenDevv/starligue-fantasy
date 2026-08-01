// Registre des motifs de kit — source de vérité pour le rendu SVG du maillot
// (Jersey.tsx). Chaque motif est une liste de régions polygonales en
// coordonnées 0-100 (même repère que Jersey.tsx) ; les régions peuvent
// dépasser cette zone sans risque car le rendu final est toujours rogné par
// le clip SVG de la silhouette du maillot.

export interface PatternRegion {
  points: [number, number][];
  /** Index dans le tableau `colors` de la zone (jersey/shorts/socks). */
  slot: number;
}

export interface PatternDefinition {
  id: string;
  label: string;
  /** Nombre de couleurs distinctes utilisées par ce motif. */
  slots: number;
  regions: PatternRegion[];
}

const BASE_REGION: PatternRegion = {
  points: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  slot: 0,
};

function rotatedRect(
  cx: number,
  cy: number,
  length: number,
  width: number,
  angleDeg: number,
): [number, number][] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hl = length / 2;
  const hw = width / 2;
  const corners: [number, number][] = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];
  return corners.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}

/** Bande diagonale finie (sash) centrée sur le vêtement. */
function diagonalBand(angleDeg: number, width: number, slot: number): PatternRegion {
  return { points: rotatedRect(50, 50, 260, width, angleDeg), slot };
}

/**
 * Demi-plan délimité par une droite passant par le centre à `angleDeg` —
 * approximé par un très grand rectangle décalé perpendiculairement, dont un
 * seul bord traverse la zone visible. Sert pour halves/quarters/diagonalSplit.
 */
function halfPlane(angleDeg: number, slot: number, side: 1 | -1 = 1): PatternRegion {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = Math.sin(rad) * side;
  const ny = -Math.cos(rad) * side;
  const offset = 150;
  return {
    points: rotatedRect(50 + nx * offset, 50 + ny * offset, 400, 400, angleDeg),
    slot,
  };
}

function verticalStripes(count: number, slot = 1): PatternRegion[] {
  const width = 100 / count;
  const regions: PatternRegion[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) continue;
    regions.push({
      points: [
        [i * width, -20],
        [(i + 1) * width, -20],
        [(i + 1) * width, 120],
        [i * width, 120],
      ],
      slot,
    });
  }
  return regions;
}

function horizontalHoops(count: number, slot = 1): PatternRegion[] {
  const height = 100 / count;
  const regions: PatternRegion[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) continue;
    regions.push({
      points: [
        [-20, i * height],
        [120, i * height],
        [120, (i + 1) * height],
        [-20, (i + 1) * height],
      ],
      slot,
    });
  }
  return regions;
}

function yoke(depth: number, slot = 1): PatternRegion {
  return {
    points: [
      [-20, -20],
      [120, -20],
      [120, depth],
      [-20, depth],
    ],
    slot,
  };
}

function crossRegions(slot = 1): PatternRegion[] {
  return [
    { points: [[40, -20], [60, -20], [60, 120], [40, 120]], slot },
    { points: [[-20, 40], [120, 40], [120, 60], [-20, 60]], slot },
  ];
}

/** Plusieurs bandes diagonales parallèles (une bande sur deux, façon rayures). */
function diagonalStripeSet(angleDeg: number, count: number, slot = 1): PatternRegion[] {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  const spacing = 140 / count;
  const bandWidth = spacing * 0.5;
  const regions: PatternRegion[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) continue;
    const offset = -70 + spacing * i;
    regions.push({
      points: rotatedRect(50 + nx * offset, 50 + ny * offset, 260, bandWidth, angleDeg),
      slot,
    });
  }
  return regions;
}

const CHEVRON_UP: [number, number][] = [
  [0, 100],
  [50, 40],
  [100, 100],
  [100, 120],
  [50, 60],
  [0, 120],
];

const CHEVRON_DOWN: [number, number][] = [
  [0, -20],
  [50, 40],
  [100, -20],
  [100, 0],
  [50, 60],
  [0, 0],
];

export const KIT_PATTERNS: PatternDefinition[] = [
  { id: "solid", label: "Uni", slots: 1, regions: [BASE_REGION] },

  { id: "stripes-4", label: "Rayures ×4", slots: 2, regions: [BASE_REGION, ...verticalStripes(4)] },
  { id: "stripes-6", label: "Rayures ×6", slots: 2, regions: [BASE_REGION, ...verticalStripes(6)] },
  { id: "stripes-8", label: "Rayures ×8", slots: 2, regions: [BASE_REGION, ...verticalStripes(8)] },
  { id: "stripes-10", label: "Rayures ×10", slots: 2, regions: [BASE_REGION, ...verticalStripes(10)] },
  {
    id: "stripes-diag",
    label: "Rayures diagonales",
    slots: 2,
    regions: [BASE_REGION, ...diagonalStripeSet(20, 6)],
  },

  { id: "hoops-3", label: "Bandes ×3", slots: 2, regions: [BASE_REGION, ...horizontalHoops(3)] },
  { id: "hoops-4", label: "Bandes ×4", slots: 2, regions: [BASE_REGION, ...horizontalHoops(4)] },
  { id: "hoops-5", label: "Bandes ×5", slots: 2, regions: [BASE_REGION, ...horizontalHoops(5)] },
  { id: "hoops-6", label: "Bandes ×6", slots: 2, regions: [BASE_REGION, ...horizontalHoops(6)] },
  {
    id: "hoops-trimmed",
    label: "Bandes liserées",
    slots: 3,
    regions: [
      BASE_REGION,
      ...horizontalHoops(4, 1),
      { points: [[-20, 24], [120, 24], [120, 27], [-20, 27]], slot: 2 },
      { points: [[-20, 74], [120, 74], [120, 77], [-20, 77]], slot: 2 },
    ],
  },

  { id: "sash-thin", label: "Écharpe fine", slots: 2, regions: [BASE_REGION, diagonalBand(45, 20, 1)] },
  { id: "sash-thick", label: "Écharpe large", slots: 2, regions: [BASE_REGION, diagonalBand(45, 36, 1)] },
  { id: "sash-reverse", label: "Écharpe inversée", slots: 2, regions: [BASE_REGION, diagonalBand(-45, 28, 1)] },
  {
    id: "sash-trimmed",
    label: "Écharpe liserée",
    slots: 3,
    // liseré (slot 2, bande large) peint d'abord, écharpe principale (slot 1,
    // bande plus étroite) par-dessus → un fin bord liseré reste visible.
    regions: [BASE_REGION, diagonalBand(45, 34, 2), diagonalBand(45, 26, 1)],
  },

  { id: "halves-vertical", label: "Mi-mi vertical", slots: 2, regions: [BASE_REGION, halfPlane(90, 1)] },
  { id: "halves-horizontal", label: "Mi-mi horizontal", slots: 2, regions: [BASE_REGION, halfPlane(0, 1)] },

  {
    id: "quarters",
    label: "Damier",
    slots: 2,
    regions: [
      BASE_REGION,
      { points: [[0, 0], [50, 0], [50, 50], [0, 50]], slot: 1 },
      { points: [[50, 50], [100, 50], [100, 100], [50, 100]], slot: 1 },
    ],
  },

  { id: "chevron-up", label: "Chevron haut", slots: 2, regions: [BASE_REGION, { points: CHEVRON_UP, slot: 1 }] },
  { id: "chevron-down", label: "Chevron bas", slots: 2, regions: [BASE_REGION, { points: CHEVRON_DOWN, slot: 1 }] },

  { id: "diagonal-30", label: "Diagonale 30°", slots: 2, regions: [BASE_REGION, halfPlane(30, 1)] },
  { id: "diagonal-60", label: "Diagonale 60°", slots: 2, regions: [BASE_REGION, halfPlane(60, 1)] },
  { id: "diagonal-neg30", label: "Diagonale -30°", slots: 2, regions: [BASE_REGION, halfPlane(-30, 1)] },

  { id: "cross", label: "Croix", slots: 2, regions: [BASE_REGION, ...crossRegions()] },

  { id: "yoke-thin", label: "Empiècement fin", slots: 2, regions: [BASE_REGION, yoke(12)] },
  { id: "yoke-thick", label: "Empiècement large", slots: 2, regions: [BASE_REGION, yoke(22)] },
];

export const KIT_PATTERN_BY_ID: Record<string, PatternDefinition> = Object.fromEntries(
  KIT_PATTERNS.map((p) => [p.id, p]),
);

export const DEFAULT_PATTERN_ID = "solid";
// KIT_PATTERNS[0] est toujours "solid" (littéral non vide ci-dessus) — seule
// assertion non-null du fichier, sert de repli garanti pour getPattern.
export const DEFAULT_PATTERN: PatternDefinition = KIT_PATTERNS[0]!;

export function getPattern(id: string): PatternDefinition {
  return KIT_PATTERN_BY_ID[id] ?? DEFAULT_PATTERN;
}
