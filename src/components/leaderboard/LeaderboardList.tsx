"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
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
}

interface LeaderboardListProps {
  entries: StandingEntry[];
  currentUserId?: string;
  pointsKey?: "totalPoints" | "points";
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export function LeaderboardList({
  entries,
  currentUserId,
  pointsKey = "totalPoints",
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

          return (
            <motion.div
              key={entry.teamId}
              variants={item}
              className={[
                "flex items-center gap-3 border-l-2 px-4 py-3",
                isMe ? "border-accent bg-accent/5 shadow-[inset_0_0_16px_rgba(45,212,191,0.08)]" : "border-transparent",
              ].join(" ")}
            >
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
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
