"use client";

import { useTranslations } from "next-intl";
import { MultiSeriesLineChart, type ChartGameweekEntry, type ChartSeries } from "./MultiSeriesLineChart";

export type ClubGoalsChartEntry = ChartGameweekEntry;

export function ClubGoalsChart({ entries }: { entries: ClubGoalsChartEntry[] }) {
  const t = useTranslations("matches");

  // Vert/rouge existants du projet (points-pos/points-neg) plutôt qu'une teinte
  // catégorielle arbitraire — "buts marqués"/"buts encaissés" est déjà une
  // opposition bon/mauvais partout ailleurs dans l'app (goalAvg du classement,
  // bonus/malus des stats joueur).
  const series: ChartSeries[] = [
    { key: "goalsFor", label: t("charts.goalsFor"), color: "#34D399" },
    { key: "goalsAgainst", label: t("charts.goalsAgainst"), color: "#F87171" },
  ];

  return <MultiSeriesLineChart series={series} entries={entries} />;
}
