"use client";

import { motion } from "framer-motion";
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
  // Aperçu de la dernière journée notée (effectif vs apport des pronostics) — LIVE
  // uniquement, voir /leaderboard/team/[teamId]. undefined en simulation (pas de
  // pronostics) ou tant qu'aucune journée n'est notée.
  lastGameweek?: { number: number; rawPoints: number; predictionDelta: number } | null;
}

const MotionLink = motion.create(Link);

export function LeaderboardGlobalWidget({
  standings,
  linkToTeam = false,
}: {
  standings: GlobalStandingRow[];
  linkToTeam?: boolean;
}) {
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
          {standings.map((s) => {
            const Row = linkToTeam ? MotionLink : "div";
            const rowProps = linkToTeam ? { href: `/leaderboard/team/${s.teamId}` } : {};
            return (
              <Row
                key={s.teamId}
                {...rowProps}
                className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${
                  linkToTeam ? "transition-colors hover:bg-border/20" : ""
                }`}
              >
                <span className="w-5 shrink-0 text-center text-xs text-text-muted">{s.rank}</span>
                <JerseyBadge jerseyConfig={s.jerseyConfig} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{s.teamName}</p>
                  <p className="truncate text-[10px] text-text-muted">{s.userName}</p>
                  {s.lastGameweek && (
                    <p className="truncate text-[10px] text-text-muted/70">
                      {t("globalLeaderboardWidget.lastGameweekPreview", {
                        number: s.lastGameweek.number,
                        squad: s.lastGameweek.rawPoints > 0 ? `+${s.lastGameweek.rawPoints}` : s.lastGameweek.rawPoints,
                        predictions:
                          s.lastGameweek.predictionDelta > 0
                            ? `+${s.lastGameweek.predictionDelta}`
                            : s.lastGameweek.predictionDelta,
                      })}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{s.totalPoints}</span>
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
