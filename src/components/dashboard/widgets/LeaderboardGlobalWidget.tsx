"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";

export interface GlobalStandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  userName: string;
  totalPoints: number;
  jerseyConfig: unknown;
}

export function LeaderboardGlobalWidget({ standings }: { standings: GlobalStandingRow[] }) {
  const t = useTranslations("dashboard");
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("globalLeaderboardWidget.title")}</p>
        <Link href="/leaderboard" className="text-[10px] text-text-muted transition-colors hover:text-text">
          {t("globalLeaderboardWidget.seeAll")}
        </Link>
      </div>
      {standings.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-muted">{t("globalLeaderboardWidget.noTeams")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {standings.map((s) => (
            <div key={s.teamId} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-text-muted">{s.rank}</span>
              <JerseyBadge jerseyConfig={s.jerseyConfig} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{s.teamName}</p>
                <p className="truncate text-[10px] text-text-muted">{s.userName}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{s.totalPoints}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
