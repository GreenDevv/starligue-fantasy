"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";
import { cn } from "@/lib/utils";

export interface LeagueStandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  userName: string;
  totalPoints: number;
  jerseyConfig: unknown;
  isMe: boolean;
  // Aperçu "sans clic" de la dernière journée notée — LIVE uniquement, voir
  // /leaderboard/team/[teamId]. null en simulation ou tant qu'aucune journée n'a
  // de détail persisté.
  breakdown: { gameweekNumber: number; rawPoints: number; predictionDelta: number } | null;
}

export interface MyLeagueRow {
  id: string;
  name: string;
  memberCount: number;
  standings: LeagueStandingRow[];
}

const VISIBLE_ROWS = 8;
const MotionLink = motion.create(Link);

// Une seule ligue à la fois, plutôt qu'une div empilant toutes les ligues du
// joueur : au-delà d'une ligue, un switcher (onglets) permet de passer de l'une
// à l'autre — le classement affiché est le vrai classement de la ligue active,
// comme LeaderboardGlobalWidget mais scopé.
export function LeaderboardLeaguesWidget({
  leagues,
  linkToTeam = false,
}: {
  leagues: MyLeagueRow[];
  linkToTeam?: boolean;
}) {
  const t = useTranslations("dashboard");
  const [activeId, setActiveId] = useState<string | undefined>(leagues[0]?.id);
  const active = leagues.find((l) => l.id === activeId) ?? leagues[0];

  const visibleRows = (() => {
    if (!active) return [];
    const top = active.standings.slice(0, VISIBLE_ROWS);
    if (top.some((s) => s.isMe)) return top;
    const me = active.standings.find((s) => s.isMe);
    return me ? [...top, me] : top;
  })();

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("leaguesWidget.title")}</p>
        {active && (
          <Link href={`/leagues/${active.id}`} className="text-[10px] text-text-muted transition-colors hover:text-text">
            {t("leaguesWidget.seeAll")}
          </Link>
        )}
      </div>

      {leagues.length === 0 || !active ? (
        // CTA volontairement discret ici (lien, pas de bouton plein) — celui du
        // bandeau de statut en haut de page porte déjà cette action en avant.
        <p className="py-4 text-center text-xs text-text-muted">
          {t("leaguesWidget.noLeagues")}{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            {t("leaguesWidget.joinLeague")}
          </Link>
        </p>
      ) : (
        <>
          {leagues.length > 1 && (
            <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none]">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  className={cn(
                    "pixel-corners-sm shrink-0 px-2 py-1 text-[10px] uppercase tracking-wide transition-colors",
                    l.id === active.id
                      ? "bg-accent text-bg"
                      : "border border-border text-text-muted hover:text-text"
                  )}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}

          <p className="mb-1.5 truncate text-[10px] text-text-muted">
            {t("leaguesWidget.memberCount", { count: active.memberCount })}
          </p>

          {active.standings.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-muted">{t("globalLeaderboardWidget.noTeams")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visibleRows.map((s) => {
                const Row = linkToTeam ? MotionLink : "div";
                const rowProps = linkToTeam ? { href: `/leaderboard/team/${s.teamId}` } : {};
                return (
                  <Row
                    key={s.teamId}
                    {...rowProps}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-1 py-0.5",
                      s.isMe && "bg-accent/5 text-accent",
                      linkToTeam && "transition-colors hover:bg-border/20"
                    )}
                  >
                    <span className="w-5 shrink-0 text-center text-xs text-text-muted">{s.rank}</span>
                    <JerseyBadge jerseyConfig={s.jerseyConfig} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", s.isMe ? "text-accent" : "text-text")}>{s.teamName}</p>
                      <p className="truncate text-[10px] text-text-muted">{s.userName}</p>
                      {s.breakdown && (
                        <p className="truncate text-[10px] text-text-muted/70">
                          {t("globalLeaderboardWidget.lastGameweekPreview", {
                            number: s.breakdown.gameweekNumber,
                            squad: s.breakdown.rawPoints > 0 ? `+${s.breakdown.rawPoints}` : s.breakdown.rawPoints,
                            predictions:
                              s.breakdown.predictionDelta > 0 ? `+${s.breakdown.predictionDelta}` : s.breakdown.predictionDelta,
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
        </>
      )}
    </div>
  );
}
