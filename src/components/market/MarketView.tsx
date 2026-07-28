"use client";

import { useState, useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { POSITIONS } from "@/lib/squad/validation";
import { PositionBadge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { SeasonMode } from "@/lib/team/active-team-context";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  valueTrend: "up" | "down" | null;
  photoUrl?: string | null;
  photoOffsetX?: number;
  photoOffsetY?: number;
  photoZoom?: number;
  club: { id: string; shortName: string; name: string; logoUrl?: string | null };
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.02 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

// La saison affichée est résolue côté serveur (cookie seasonMode, voir page.tsx) —
// ce composant ne fait que fetch /api/players, qui lit le même cookie pour filtrer.
export function MarketView({ mode }: { mode: SeasonMode }) {
  const t = useTranslations("market");
  const tLabels = useTranslations("labels");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"marketValue" | "lastName">("marketValue");

  useEffect(() => {
    setLoading(true);
    fetch("/api/players?perPage=250")
      .then((r) => r.json())
      .then((data: { data?: { players: Player[] } }) => {
        if (data.data?.players) setPlayers(data.data.players);
        setLoading(false);
      });
  }, [mode]);

  const filtered = useMemo(() => {
    return players
      .filter((p) => {
        if (posFilter !== "ALL" && p.position !== posFilter) return false;
        if (
          search &&
          !`${p.firstName} ${p.lastName} ${p.club.shortName}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((a, b) =>
        sortBy === "marketValue"
          ? b.marketValue - a.marketValue
          : a.lastName.localeCompare(b.lastName)
      );
  }, [players, posFilter, search, sortBy]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl text-text">{t("title")}</h1>
        {!loading && (
          <p className="mt-1 text-sm text-text-muted">
            {t("playerCount", { count: players.length, seasonMode: tLabels(`seasonMode.${mode}`) })}
          </p>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pixel-corners w-full border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent-secondary focus:shadow-glow-amber focus:outline-none"
      />

      {/* Position filter + sort */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
          {(["ALL", ...POSITIONS] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={[
                "pixel-corners-sm shrink-0 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors",
                posFilter === pos
                  ? "bg-accent text-bg shadow-glow-accent"
                  : "border border-border text-text-muted hover:border-accent/50 hover:text-text",
              ].join(" ")}
            >
              {pos === "ALL" ? t("allPositions") : tLabels(`positionShort.${pos}`)}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            setSortBy((s) => (s === "marketValue" ? "lastName" : "marketValue"))
          }
          className="pixel-corners-sm shrink-0 border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
        >
          {sortBy === "marketValue" ? t("sortByValue") : t("sortByName")}
        </button>
      </div>

      {/* Player list */}
      {loading ? (
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} className={i > 0 ? "border-t border-border" : ""} />
          ))}
        </div>
      ) : (
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              {t("noPlayersFound")}
            </p>
          ) : (
            <motion.div className="divide-y divide-border" initial="hidden" animate="show" variants={listVariants}>
              {filtered.map((player) => (
                <motion.div key={player.id} variants={itemVariants}>
                  <Link
                    href={`/players/${player.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20 active:bg-border/30"
                  >
                    <PlayerAvatar player={player} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-text">
                        {player.firstName} {player.lastName}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-text-muted">
                        <ClubLogo club={player.club} size="xs" />
                        {player.club.shortName}
                      </span>
                    </div>
                    <PositionBadge position={player.position} className="shrink-0" />
                    <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-right font-arcade text-lg tracking-wide text-accent-secondary">
                      {player.valueTrend === "up" && <span className="text-sm text-points-pos" title={t("trend.up")}>▲</span>}
                      {player.valueTrend === "down" && <span className="text-sm text-points-neg" title={t("trend.down")}>▼</span>}
                      {player.marketValue.toFixed(1)}M
                    </span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
