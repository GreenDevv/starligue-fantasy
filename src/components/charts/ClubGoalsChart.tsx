"use client";

import { MultiSeriesLineChart, type ChartGameweekEntry, type ChartSeries } from "./MultiSeriesLineChart";

export type ClubGoalsChartEntry = ChartGameweekEntry;

// Vert/rouge existants du projet (points-pos/points-neg) plutôt qu'une teinte
// catégorielle arbitraire — "buts marqués"/"buts encaissés" est déjà une
// opposition bon/mauvais partout ailleurs dans l'app (goalAvg du classement,
// bonus/malus des stats joueur).
const SERIES: ChartSeries[] = [
  { key: "goalsFor", label: "Buts marqués", color: "#34D399" },
  { key: "goalsAgainst", label: "Buts encaissés", color: "#F87171" },
];

export function ClubGoalsChart({ entries }: { entries: ClubGoalsChartEntry[] }) {
  return <MultiSeriesLineChart series={SERIES} entries={entries} />;
}
