// Regroupement visuel des lignes du classement par nombre de points égal —
// fonction pure, testée. Chaque groupe de points reçoit une teinte de fond
// nettement différente du groupe précédent (pas juste une alternance
// clair/foncé) — demande explicite, ARCHITECTURE.md §31.
export function computePointsGroupIndices(rows: { points: number }[]): number[] {
  const indices: number[] = [];
  let currentGroup = -1;
  let lastPoints: number | null = null;
  for (const row of rows) {
    if (row.points !== lastPoints) {
      currentGroup++;
      lastPoints = row.points;
    }
    indices.push(currentGroup);
  }
  return indices;
}

// Teintes très légères réutilisant la palette de marque existante
// (tailwind.config.ts, ARCHITECTURE.md §8) plutôt que d'introduire de
// nouvelles couleurs hors charte — suffisamment de variations pour distinguer
// visuellement des paliers de points adjacents. Boucle si plus de groupes que
// de couleurs (des groupes non adjacents peuvent alors partager une teinte,
// sans ambiguïté puisque d'autres groupes différemment colorés les séparent).
const POINTS_GROUP_BG_CLASSES = [
  "bg-accent/[0.07]",
  "bg-accent-secondary/[0.08]",
  "bg-points-pos/[0.07]",
  "bg-points-neg/[0.07]",
  "bg-border/25",
];

export function pointsGroupBgClass(groupIndex: number): string {
  return POINTS_GROUP_BG_CLASSES[groupIndex % POINTS_GROUP_BG_CLASSES.length]!;
}
