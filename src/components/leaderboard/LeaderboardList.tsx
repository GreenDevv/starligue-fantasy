"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";

interface StandingEntry {
  rank: number;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  totalPoints?: number;
  points?: number;
  jerseyConfig?: unknown;
  leagueName?: string;
  // Détail effectif vs pronostics d'une journée (la journée elle-même en mode
  // "points", la dernière notée en mode "totalPoints") — LIVE uniquement, voir
  // /leaderboard/team/[teamId] pour le détail complet saison. undefined en
  // simulation ou tant qu'aucune journée n'est notée.
  breakdown?: { gameweekNumber: number; rawPoints: number; predictionDelta: number } | null;
}

interface LeaderboardListProps {
  entries: StandingEntry[];
  currentUserId?: string;
  pointsKey?: "totalPoints" | "points";
  // Détail par journée (effectif vs pronostics) — uniquement pertinent en LIVE,
  // voir /leaderboard/team/[teamId]. Jamais activé pour des entrées de simulation
  // (SimulationTeam n'a pas d'équivalent côté breakdown).
  linkToTeam?: boolean;
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const MotionLink = motion.create(Link);

export function LeaderboardList({
  entries,
  currentUserId,
  pointsKey = "totalPoints",
  linkToTeam = false,
}: LeaderboardListProps) {
  const t = useTranslations("leaderboard");

  if (entries.length === 0) {
    return (
      <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm text-text-muted">{t("list.empty")}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="pixel-corners overflow-hidden border border-border bg-surface"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.03 } } }}
    >
      <div className="divide-y divide-border">
        {entries.map((entry) => {
          const pts = (pointsKey === "points" ? entry.points : entry.totalPoints) ?? 0;
          const isMe = entry.userId === currentUserId;
          const medalGlow =
            entry.rank === 1
              ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]"
              : entry.rank === 2
                ? "drop-shadow-[0_0_6px_rgba(156,163,175,0.7)]"
                : entry.rank === 3
                  ? "drop-shadow-[0_0_6px_rgba(180,83,9,0.7)]"
                  : "";

          const rowClassName = [
            "flex items-center gap-3 border-l-2 px-4 py-3",
            isMe ? "border-accent bg-accent/5 shadow-[inset_0_0_16px_rgba(45,212,191,0.08)]" : "border-transparent",
            linkToTeam && "transition-colors hover:bg-border/20",
          ]
            .filter(Boolean)
            .join(" ");

          const Row = linkToTeam ? MotionLink : motion.div;
          const rowProps = linkToTeam ? { href: `/leaderboard/team/${entry.teamId}` } : {};

          return (
            <Row key={entry.teamId} variants={item} className={rowClassName} {...rowProps}>
              {/* Rank */}
              <span
                className={[
                  "w-7 shrink-0 text-center font-arcade text-xl tracking-wide",
                  medalGlow,
                  entry.rank === 1
                    ? "text-accent-secondary"
                    : entry.rank === 2
                      ? "text-[#9CA3AF]"
                      : entry.rank === 3
                        ? "text-[#B45309]"
                        : "text-text-muted",
                ].join(" ")}
              >
                {entry.rank}
              </span>

              {Boolean(entry.jerseyConfig) && <JerseyBadge jerseyConfig={entry.jerseyConfig} size="xs" />}

              {/* Team + user */}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${isMe ? "text-accent" : "text-text"}`}>
                  {entry.teamName}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {entry.userName}
                  {entry.leagueName && <span className="text-text-muted/60"> · {entry.leagueName}</span>}
                </p>
                {entry.breakdown && (
                  <p className="truncate text-[11px] text-text-muted/70">
                    {t("list.breakdown", {
                      number: entry.breakdown.gameweekNumber,
                      squad: entry.breakdown.rawPoints > 0 ? `+${entry.breakdown.rawPoints}` : entry.breakdown.rawPoints,
                      predictions:
                        entry.breakdown.predictionDelta > 0
                          ? `+${entry.breakdown.predictionDelta}`
                          : entry.breakdown.predictionDelta,
                    })}
                  </p>
                )}
              </div>

              {/* Points */}
              <span
                className={[
                  "shrink-0 font-arcade text-xl tracking-wide",
                  pts > 0
                    ? "text-points-pos drop-shadow-[0_0_6px_currentColor]"
                    : pts < 0
                      ? "text-points-neg drop-shadow-[0_0_6px_currentColor]"
                      : "text-text-muted",
                ].join(" ")}
              >
                {pts > 0 ? `+${pts}` : pts}
              </span>
            </Row>
          );
        })}
      </div>
    </motion.div>
  );
}
