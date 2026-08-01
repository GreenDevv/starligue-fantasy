// Silhouette du maillot, en coordonnées 0-100 (même repère que
// kitPatterns.ts). Source de vérité unique pour Jersey.tsx (chemin SVG, via
// silhouetteToSvgPath) — seul consommateur restant depuis la suppression de
// l'éditeur de personnalisation (JerseyEditor/KitFigure) ; les silhouettes
// short/chaussettes qu'utilisait sa galerie de motifs ont été retirées avec
// lui.
//
// Le contour du maillot (JERSEY_RIGHT_HALF / JERSEY_SLEEVE_RIGHT) n'est pas
// dessiné à la main : ses points sont ré-échelonnés depuis le path de
// l'icône "shirt" (solid) de Font Awesome Free 6 (CC BY 4.0,
// https://fontawesome.com/icons/shirt), aplati en segments droits puis
// recadré dans notre repère 0-100. Les tentatives précédentes (octogone à
// angles droits, puis courbes dessinées à la main) ne rendaient pas bien —
// repartir d'un contour de t-shirt déjà proportionné (col rond, manches
// courtes galbées, ourlet arrondi) donne un résultat nettement plus
// crédible. Toujours uniquement des segments droits (polygone dense) pour
// rester simple à cliper en SVG.

export type Silhouette = [number, number][][];

type Point = [number, number];

// Reflète une liste de points par rapport à l'axe vertical x=50, en ordre
// inverse — permet de construire la moitié gauche du maillot à partir de la
// moitié droite tout en gardant un contour continu (sens de parcours cohérent).
function mirrorX(points: Point[]): Point[] {
  return points.map(([x, y]): Point => [100 - x, y]).reverse();
}

// Moitié droite du maillot, de l'encolure (centre) à l'ourlet (centre).
const JERSEY_RIGHT_HALF: Point[] = [
  [50, 23.59], [53.06, 23.21], [55.88, 22.11], [58.41, 20.38], [60.56, 18.11],
  [62.26, 15.37], [63.44, 12.24], [63.67, 11.63], [63.98, 11.09], [64.37, 10.64],
  [64.83, 10.3], [65.34, 10.08], [65.9, 10], [67.75, 10], [69.39, 10.11],
  [70.99, 10.44], [72.55, 10.98], [74.04, 11.72], [75.46, 12.66], [76.78, 13.79],
  [95.33, 31.65], [95.78, 32.15], [96.17, 32.71], [96.49, 33.33], [96.74, 33.99],
  [96.91, 34.68], [97, 35.4], [97.01, 36.13], [96.93, 36.84], [96.78, 37.54],
  [96.54, 38.21], [96.23, 38.83], [95.85, 39.41], [87.63, 50.29], [86.7, 51.24],
  [85.62, 51.85], [84.46, 52.13], [83.27, 52.06], [82.12, 51.65], [81.07, 50.88],
  [73.51, 43.59], [73.51, 86.13], [73.17, 89.02], [72.22, 91.61], [70.75, 93.81],
  [68.85, 95.51], [66.6, 96.61], [64.1, 97], [50, 97],
];

// Manche droite seule (épaule → aisselle), sous-suite de JERSEY_RIGHT_HALF —
// exportée pour que Jersey.tsx puisse peindre les manches contrastées
// exactement dans cette région (le clip sur la silhouette complète du
// maillot recadre le reste, donc pas besoin de matcher le bord extérieur au
// pixel près, seule la couture aisselle↔épaule doit être correcte).
export const JERSEY_SLEEVE_RIGHT: Point[] = JERSEY_RIGHT_HALF.slice(12, 41);

const JERSEY_OUTLINE: Point[] = [...JERSEY_RIGHT_HALF, ...mirrorX(JERSEY_RIGHT_HALF).slice(1)];

export const JERSEY_SILHOUETTE: Silhouette = [JERSEY_OUTLINE];

export function silhouetteToSvgPath(silhouette: Silhouette): string {
  return silhouette
    .map((sub) => `M${sub.map(([x, y]) => `${x},${y}`).join(" L")} Z`)
    .join(" ");
}
