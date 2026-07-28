"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PositionBadge } from "@/components/ui/Badge";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { SeasonMode } from "@/lib/team/active-team-context";
import { resolveApiError } from "@/lib/api/error-messages";

interface MarketPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  photoUrl?: string | null;
  club: { id: string; shortName: string; name: string; logoUrl?: string | null };
}

interface SquadPlayer extends MarketPlayer {
  injuredAt?: string | null;
}

interface TeamResponse {
  data?: {
    budget: number;
    jokersRemaining: number;
    transferWindowOpen: boolean;
    squad: Array<{ player: SquadPlayer & { isActive: boolean } }>;
  };
}

export function TransfersView({ mode }: { mode: SeasonMode }) {
  const t = useTranslations("team");
  const tRoot = useTranslations();
  const router = useRouter();
  const leagueId = useSearchParams().get("league");
  const leagueSuffix = leagueId ? `?league=${leagueId}` : "";
  const isSimulation = mode === "simulation";
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [budget, setBudget] = useState(0);
  const [jokersRemaining, setJokersRemaining] = useState(0);
  const [windowOpen, setWindowOpen] = useState(false);
  const [market, setMarket] = useState<MarketPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellPlayerId, setSellPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch(`/api/my-team${leagueSuffix}`).then((r) => r.json()),
      fetch("/api/players?perPage=500").then((r) => r.json()),
    ]).then(([teamRes, playersRes]: [TeamResponse, { data?: { players: MarketPlayer[] } }]) => {
      if (teamRes.data) {
        setSquad(teamRes.data.squad.map((s) => s.player));
        setBudget(teamRes.data.budget);
        setJokersRemaining(teamRes.data.jokersRemaining);
        setWindowOpen(teamRes.data.transferWindowOpen);
      }
      if (playersRes.data?.players) setMarket(playersRes.data.players);
      setLoading(false);
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [leagueSuffix]);

  const sellPlayer = squad.find((p) => p.id === sellPlayerId) ?? null;
  const squadIds = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);

  const buyCandidates = useMemo(() => {
    if (!sellPlayer) return [];
    return market
      .filter((p) => p.position === sellPlayer.position && !squadIds.has(p.id))
      .filter(
        (p) =>
          search === "" ||
          `${p.firstName} ${p.lastName} ${p.club.shortName}`.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.marketValue - a.marketValue);
  }, [market, sellPlayer, squadIds, search]);

  const canTransferNow = windowOpen || Boolean(sellPlayer?.injuredAt && jokersRemaining > 0);

  async function confirmTransfer(buyPlayer: MarketPlayer) {
    if (!sellPlayer) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/my-team/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellPlayerId: sellPlayer.id, buyPlayerId: buyPlayer.id, ...(leagueId ? { leagueId } : {}) }),
      });
      const data = (await res.json()) as { data?: { success: boolean }; error?: { code?: string; message: string } };
      if (data.data?.success) {
        setSuccess(t("transfers.transferSuccess", { name: `${buyPlayer.firstName} ${buyPlayer.lastName}` }));
        setSellPlayerId(null);
        setSearch("");
        load();
      } else {
        setError(resolveApiError(tRoot, "team", data.error?.code));
      }
    } catch {
      setError(resolveApiError(tRoot, "team", "NETWORK"));
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <div className="pixel-corners border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} className={i > 0 ? "border-t border-border" : ""} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          {isSimulation && (
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-secondary">{t("common.simulationMode")}</p>
          )}
          <h1 className="text-2xl text-text">{t("transfers.title")}</h1>
        </div>
        <button onClick={() => router.push(leagueId ? `/leagues/${leagueId}` : "/leagues")} className="text-xs text-text-muted transition-colors hover:text-text">
          ← {t("common.backToTeam")}
        </button>
      </div>

      {/* Statut */}
      <div
        className={`pixel-corners border px-4 py-3 text-sm ${
          windowOpen
            ? "border-points-pos/40 bg-points-pos/10 text-points-pos shadow-[0_0_16px_rgba(52,211,153,0.25)]"
            : "border-border bg-surface text-text-muted"
        }`}
      >
        {windowOpen ? (
          t("transfers.windowOpen")
        ) : (
          <>
            {t("transfers.windowClosed")}{" "}
            {jokersRemaining > 0
              ? t("transfers.jokerAvailable", { count: jokersRemaining })
              : t("transfers.noJokersLeft")}
          </>
        )}
      </div>

      <p className="text-sm text-text-muted">
        {t("transfers.remainingBudgetLabel")} <span className="font-arcade text-lg text-accent-secondary">{budget.toFixed(1)}M</span>
      </p>

      {error && <p className="text-sm text-points-neg">{error}</p>}
      {success && <p className="text-sm text-points-pos">{success}</p>}

      {/* Effectif — choix du joueur à vendre */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {t("transfers.squadHint")}
        </p>
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {squad.map((p) => {
            const selected = p.id === sellPlayerId;
            const injured = Boolean(p.injuredAt);
            return (
              <button
                key={p.id}
                onClick={() => setSellPlayerId(selected ? null : p.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                  selected
                    ? isSimulation
                      ? "border-l-2 border-accent-secondary bg-accent-secondary/10"
                      : "border-l-2 border-accent bg-accent/10"
                    : "border-l-2 border-transparent hover:bg-border/20"
                )}
              >
                <PlayerAvatar player={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
                    {p.firstName} {p.lastName}
                    {injured && (
                      <span className="pixel-corners-sm bg-points-neg/15 px-1.5 py-0.5 text-[9px] font-semibold text-points-neg">
                        {t("transfers.injuredBadge")}
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-text-muted">
                    <ClubLogo club={p.club} size="xs" />
                    {p.club.shortName}
                  </p>
                </div>
                <PositionBadge position={p.position} className="shrink-0" />
                <span className="w-14 shrink-0 text-right font-arcade text-base text-accent-secondary">
                  {p.marketValue.toFixed(1)}M
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Marché filtré sur le poste du joueur à remplacer */}
      {sellPlayer && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              {t("transfers.replacementFor", { name: `${sellPlayer.firstName} ${sellPlayer.lastName}` })}
            </p>
            {!canTransferNow && (
              <span className="text-xs text-points-neg">{t("transfers.transferUnavailable")}</span>
            )}
          </div>
          <input
            type="text"
            placeholder={t("transfers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "pixel-corners-sm mb-2 w-full border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-shadow focus:outline-none",
              isSimulation ? "focus:border-accent-secondary focus:shadow-glow-amber" : "focus:border-accent focus:shadow-glow-accent"
            )}
          />
          <div className="pixel-corners overflow-hidden border border-border bg-surface">
            {buyCandidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">{t("transfers.noPlayersFound")}</p>
            ) : (
              buyCandidates.slice(0, 40).map((p) => {
                const newBudget = budget + sellPlayer.marketValue - p.marketValue;
                const affordable = newBudget >= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => canTransferNow && affordable && confirmTransfer(p)}
                    disabled={!canTransferNow || !affordable || submitting}
                    className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PlayerAvatar player={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-text-muted">
                        <ClubLogo club={p.club} size="xs" />
                        {p.club.shortName}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-arcade text-base ${
                        affordable ? "text-accent-secondary" : "text-points-neg"
                      }`}
                    >
                      {p.marketValue.toFixed(1)}M
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
