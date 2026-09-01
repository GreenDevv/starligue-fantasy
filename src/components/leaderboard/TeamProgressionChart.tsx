"use client";

// "Historique de progression" du classement (journée par journée) — même moteur
// SVG que ClubGoalsChart, pas de dépendance ajoutée. Effectif/Pronostics en
// traits pleins (ce qui compose le total), Total en pointillé (dérivé des deux
// premiers, jamais une 3e source de vérité).
import { useTranslations } from "next-intl";
import { MultiSeriesLineChart, type ChartGameweekEntry, type ChartSeries } from "@/components/charts/MultiSeriesLineChart";

export interface TeamProgressionEntry {
  gameweekNumber: number;
  rawPoints: number;
  predictionDelta: number;
  points: number;
}

export function TeamProgressionChart({ entries }: { entries: TeamProgressionEntry[] }) {
  const t = useTranslations("leaderboard");

  const series: ChartSeries[] = [
    { key: "squad", label: t("team.col.squad"), color: "#2DD4BF" },
    { key: "predictions", label: t("team.col.predictions"), color: "#F59E0B" },
    { key: "total", label: t("team.col.total"), color: "#94A3B8", dashed: true },
  ];

  const chartEntries: ChartGameweekEntry[] = entries.map((e) => ({
    gameweekNumber: e.gameweekNumber,
    values: { squad: e.rawPoints, predictions: e.predictionDelta, total: e.points },
  }));

  return <MultiSeriesLineChart series={series} entries={chartEntries} />;
}
