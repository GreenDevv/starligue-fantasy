"use client";

import { CHARTABLE_STAT_LINES } from "@/lib/stats/stat-chart-colors";
import { MultiSeriesLineChart, type ChartGameweekEntry } from "./MultiSeriesLineChart";

export type PlayerStatsChartEntry = ChartGameweekEntry;

const DEFAULT_ACTIVE_KEYS = ["goalsTotal", "assists", "ballsRecovered", "neutralizations"];

export function PlayerStatsChart({
  entries,
  primaryLabel,
  compareEntries,
  compareLabel,
}: {
  entries: PlayerStatsChartEntry[];
  primaryLabel?: string;
  compareEntries?: PlayerStatsChartEntry[];
  compareLabel?: string;
}) {
  return (
    <MultiSeriesLineChart
      series={CHARTABLE_STAT_LINES}
      entries={entries}
      defaultActiveKeys={DEFAULT_ACTIVE_KEYS}
      primaryLabel={primaryLabel}
      compareEntries={compareEntries}
      compareLabel={compareLabel}
    />
  );
}
