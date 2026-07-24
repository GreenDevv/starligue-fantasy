// Palette catégorielle pour le graphique multi-séries "stats par journée"
// (src/components/charts/PlayerStatsChart.tsx) — 8 teintes validées CVD-safe sur
// la surface sombre de l'app (#171C24, cf. skill dataviz/scripts/validate_palette.js,
// ordre fixe, jamais recyclé arbitrairement). shotPercentage exclu : c'est un ratio
// (0-100), pas un compteur — mélanger son échelle avec des compteurs de but/passe/
// interception sur un même axe linéaire écraserait les autres séries (même piège
// que seasonStatTotals dans /players/[id], qui l'exclut déjà pour la même raison).
// Au-delà des 8 teintes (12 lignes chartables), on recycle la palette en pointillés
// (dashed) plutôt que de générer une 9e teinte à la volée — l'identité reste portée
// par le label du bouton-légende (toujours visible), pas seulement par la couleur.
import { STAT_LINES, type StatLine } from "./stat-lines";

const CHART_PALETTE = [
  "#3987e5", // blue
  "#008300", // green
  "#d55181", // magenta
  "#c98500", // yellow
  "#199e70", // aqua
  "#d95926", // orange
  "#9085e9", // violet
  "#e66767", // red
];

export interface ChartableStatLine extends StatLine {
  color: string;
  dashed: boolean;
}

export const CHARTABLE_STAT_LINES: ChartableStatLine[] = STAT_LINES.filter(
  (line) => line.key !== "shotPercentage"
).map((line, i) => ({
  ...line,
  color: CHART_PALETTE[i % CHART_PALETTE.length]!,
  dashed: Math.floor(i / CHART_PALETTE.length) % 2 === 1,
}));

export function getChartableStatLine(key: string): ChartableStatLine | undefined {
  return CHARTABLE_STAT_LINES.find((s) => s.key === key);
}
