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
import { Sparkline } from "@/components/ui/Sparkline";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { SeasonMode } from "@/lib/team/active-team-context";
import type { MarketPlayer } from "@/lib/players/market-list";

type SortKey = "pointsPerMillion" | "seasonPoints" | "marketValue" | "lastName";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.015 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const SORT_CYCLE: SortKey[] = ["pointsPerMillion", "seasonPoints", "marketValue", "lastName"];

export function MarketView({ mode }: { mode: SeasonMode }) {
  const t = useTranslations("market");
  const tLabels = useTranslations("labels");
  const [players, setPlayers] = useState<MarketPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("marketValue");

  useEffect(() => {
    setLoading(true);
    fetch("/api/market")
      .then((r) => r.json())
      .then((data: { data?: { players: MarketPlayer[] } }) => {
        if (data.data?.players) setPlayers(data.data.players);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mode]);

  const hasScoredData = useMemo(() => players.some((p) => p.seasonPoints !== 0), [players]);

  const byPosition = useMemo(
    () => players.filter((p) => posFilter === "ALL" || p.position === posFilter),
    [players, posFilter]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = byPosition.filter(
      (p) => !q || `${p.firstName} ${p.lastName} ${p.club.shortName}`.toLowerCase().includes(q)
    );
    return rows.sort((a, b) => {
      switch (sortBy) {
        case "lastName":
          return a.lastName.localeCompare(b.lastName);
        case "seasonPoints":
          return b.seasonPoints - a.seasonPoints;
        case "pointsPerMillion":
          return b.pointsPerMillion - a.pointsPerMillion;
        default:
          return b.marketValue - a.marketValue;
      }
    });
  }, [byPosition, search, sortBy]);

  // Bande "meilleurs rendements" : top points/M du filtre poste courant (joueurs
  // ayant déjà marqué). Ignore la recherche texte — c'est une reco, pas un résultat.
  const bestValue = useMemo(() => {
    if (!hasScoredData) return [];
    return [...byPosition]
      .filter((p) => p.seasonPoints > 0)
      .sort((a, b) => b.pointsPerMillion - a.pointsPerMillion)
      .slice(0, 8);
  }, [byPosition, hasScoredData]);

  const sortLabel: Record<SortKey, string> = {
    pointsPerMillion: t("sortByValueRatio"),
    seasonPoints: t("sortByPoints"),
    marketValue: t("sortByValue"),
    lastName: t("sortByName"),
  };

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
          onClick={() => setSortBy((s) => SORT_CYCLE[(SORT_CYCLE.indexOf(s) + 1) % SORT_CYCLE.length]!)}
          className="pixel-corners-sm shrink-0 border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
          title={t("sortCycleHint")}
        >
          ↓ {sortLabel[sortBy]}
        </button>
      </div>

      {/* Bande "meilleurs rendements" */}
      {!loading && bestValue.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("bestValueTitle")}</p>
            <p className="text-[10px] text-text-muted">{t("bestValueSubtitle")}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
            {bestValue.map((p) => (
              <Link
                key={p.id}
                href={`/players/${p.id}`}
                className="pixel-corners-sm flex w-32 shrink-0 flex-col items-center gap-1 border border-border bg-surface p-2 text-center transition-colors hover:border-accent/50"
              >
                <PlayerAvatar player={p} size="md" variant="photo" focus="head" />
                <span className="w-full truncate text-xs font-medium text-text">
                  {p.firstName.charAt(0)}. {p.lastName}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-text-muted">
                  <ClubLogo club={p.club} size="xs" />
                  {p.club.shortName} · {tLabels(`positionShort.${p.position}`)}
                </span>
                <span className="font-arcade text-xl leading-none text-accent drop-shadow-[0_0_6px_currentColor]">
                  {p.pointsPerMillion.toFixed(1)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-text-muted">
                  {t("perMillionShort")} · {p.marketValue.toFixed(1)}M
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Player list */}
      {loading ? (
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} className={i > 0 ? "border-t border-border" : ""} />
          ))}
        </div>
      ) : (
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("noPlayersFound")}</p>
          ) : (
            <motion.div className="divide-y divide-border" initial="hidden" animate="show" variants={listVariants}>
              {filtered.map((player) => (
                <motion.div key={player.id} variants={itemVariants}>
                  <Link
                    href={`/players/${player.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20 active:bg-border/30"
                  >
                    <PlayerAvatar player={player} size="sm" variant="photo" focus="head" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-text">
                        {player.firstName} {player.lastName}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-text-muted">
                        <ClubLogo club={player.club} size="xs" />
                        {player.club.shortName}
                        <PositionBadge position={player.position} className="ml-0.5 scale-90" />
                      </span>
                    </div>

                    {player.form.length > 0 && (
                      <Sparkline values={player.form} className="hidden shrink-0 min-[360px]:block" />
                    )}

                    <div className="flex w-24 shrink-0 flex-col items-end">
                      <span className="flex items-center gap-1 font-arcade text-lg leading-none tracking-wide text-accent-secondary">
                        {player.valueTrend === "up" && (
                          <span className="text-xs text-points-pos" title={t("trend.up")}>▲</span>
                        )}
                        {player.valueTrend === "down" && (
                          <span className="text-xs text-points-neg" title={t("trend.down")}>▼</span>
                        )}
                        {player.marketValue.toFixed(1)}M
                      </span>
                      {hasScoredData && (
                        <span className="mt-0.5 text-[10px] tabular-nums text-text-muted">
                          {player.seasonPoints} {t("pointsShort")}
                          {player.pointsPerMillion !== 0 && (
                            <> · {player.pointsPerMillion.toFixed(1)}{t("perMillionShort")}</>
                          )}
                        </span>
                      )}
                    </div>
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
