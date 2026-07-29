"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Position } from "@/lib/squad/validation";
import { POSITIONS } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  photoUrl?: string | null;
  club: { id: string; shortName: string; name: string; logoUrl?: string | null };
}

interface AuctionState {
  roundNumber: number;
  roundStatus: "OPEN" | "RESOLVED";
  roundCount: number;
  auctionFinished: boolean;
  budget: number;
  initialBudget: number;
  squadSize: number;
  squadPositionCounts: Partial<Record<Position, number>>;
  isValidated: boolean;
  myBids: Array<{ playerId: string; amount: number }>;
  submitted: boolean;
  submittedCount: number;
  memberCount: number;
  unavailablePlayerIds: string[];
}

const POLL_INTERVAL_MS = 5000;

export function AuctionBuildView({ leagueId, leagueSuffix }: { leagueId: string; leagueSuffix: string }) {
  const t = useTranslations("team");
  const tLabels = useTranslations("labels");
  const router = useRouter();

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [state, setState] = useState<AuctionState | null>(null);
  const [draftBids, setDraftBids] = useState<Record<string, string>>({});
  const [activePos, setActivePos] = useState<Position>("GK");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRoundNumber = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/auction`);
    const data = (await res.json()) as { data?: AuctionState; error?: { message?: string } };
    if (data.data) {
      setState(data.data);
      // Nouveau tour (résolution passée) : on repart d'un brouillon vide plutôt
      // que de garder les montants du tour précédent.
      if (lastRoundNumber.current !== null && lastRoundNumber.current !== data.data.roundNumber) {
        setDraftBids({});
      } else if (lastRoundNumber.current === null) {
        setDraftBids(Object.fromEntries(data.data.myBids.map((b) => [b.playerId, String(b.amount)])));
      }
      lastRoundNumber.current = data.data.roundNumber;
    }
    return data.data ?? null;
  }, [leagueId]);

  useEffect(() => {
    Promise.all([fetch("/api/players?perPage=500").then((r) => r.json()), fetchState()]).then(
      ([playersRes]: [{ data?: { players: Player[] } }, AuctionState | null]) => {
        if (playersRes.data?.players) setAllPlayers(playersRes.data.players);
        setLoading(false);
      }
    );
  }, [fetchState]);

  // Poll pendant qu'un tour est ouvert : les autres membres soumettent en
  // parallèle, la résolution peut survenir sans action de ma part.
  useEffect(() => {
    if (!state || state.auctionFinished || state.roundStatus !== "OPEN") return;
    const id = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state, fetchState]);

  const remainingByPosition = useMemo(() => {
    const remaining: Partial<Record<Position, number>> = {};
    for (const pos of POSITIONS) remaining[pos] = 2 - (state?.squadPositionCounts[pos] ?? 0);
    return remaining;
  }, [state]);

  const unavailableSet = useMemo(() => new Set(state?.unavailablePlayerIds ?? []), [state]);

  const filteredPlayers = useMemo(
    () =>
      allPlayers.filter(
        (p) =>
          p.position === activePos &&
          !unavailableSet.has(p.id) &&
          (search === "" ||
            `${p.firstName} ${p.lastName} ${p.club.shortName}`.toLowerCase().includes(search.toLowerCase()))
      ),
    [allPlayers, activePos, unavailableSet, search]
  );

  const totalCommitted = useMemo(
    () => Object.values(draftBids).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [draftBids]
  );

  const bidsCountByPosition = useMemo(() => {
    const counts = new Map<Position, number>();
    for (const [playerId, value] of Object.entries(draftBids)) {
      if (!(parseFloat(value) > 0)) continue;
      const player = allPlayers.find((p) => p.id === playerId);
      if (!player) continue;
      counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
    }
    return counts;
  }, [draftBids, allPlayers]);

  function setBid(playerId: string, position: Position, value: string) {
    setDraftBids((prev) => {
      const next = { ...prev };
      if (value === "") {
        delete next[playerId];
      } else {
        next[playerId] = value;
      }
      return next;
    });
    void position; // le contrôle "slot restant" reste indicatif côté client, la vraie limite est serveur
  }

  async function saveBids(): Promise<boolean> {
    setSaving(true);
    setError(null);
    const bids = Object.entries(draftBids)
      .map(([playerId, value]) => ({ playerId, amount: parseFloat(value) }))
      .filter((b) => b.amount > 0);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/auction/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bids }),
      });
      const data = (await res.json()) as { data?: { success: boolean }; error?: { message?: string } };
      if (!data.data?.success) {
        setError(data.error?.message ?? t("auction.genericError"));
        setSaving(false);
        return false;
      }
      setSaving(false);
      return true;
    } catch {
      setError(t("auction.genericError"));
      setSaving(false);
      return false;
    }
  }

  async function handleSubmitRound() {
    setSubmitting(true);
    const saved = await saveBids();
    if (!saved) {
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/auction/submit`, { method: "POST" });
      const data = (await res.json()) as {
        data?: { resolved: boolean };
        error?: { message?: string };
      };
      if (!data.data) {
        setError(data.error?.message ?? t("auction.genericError"));
      } else {
        await fetchState();
      }
    } catch {
      setError(t("auction.genericError"));
    }
    setSubmitting(false);
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">{t("auction.loadingAuction")}</p>
      </div>
    );
  }

  if (state.auctionFinished) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg text-text">{t("auction.finishedTitle")}</p>
        <p className="max-w-sm text-sm text-text-muted">
          {t("auction.finishedBody", { count: state.roundCount, squadSize: state.squadSize })}
        </p>
        <button
          onClick={() => router.push(`/team/start${leagueSuffix}`)}
          className="pixel-corners-sm bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90"
        >
          {t("common.continue")}
        </button>
      </div>
    );
  }

  return (
    <div className="pb-36">
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-secondary">
          {t("auction.roundLabel", { number: state.roundNumber, total: state.roundCount })}
        </p>
        <h1 className="text-2xl text-text">{t("auction.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("auction.subtitle")}</p>
      </div>

      <div className="lg:relative lg:left-1/2 lg:right-1/2 lg:-mx-[50vw] lg:w-screen">
        <div className="lg:mx-auto lg:max-w-6xl lg:px-6">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[240px_1fr_320px] lg:items-start lg:gap-6">
            {/* Budget + progression */}
            <div className="order-1 sticky top-12 lg:top-20 z-[5] -mx-4 border-b border-border bg-bg/95 px-4 pb-3 pt-2 backdrop-blur-sm lg:mx-0 lg:border-none lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
              <div className="pixel-corners border border-border bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide text-text-muted">
                  <span>{t("auction.budgetLabel")}</span>
                  <span className="font-arcade text-base tabular-nums tracking-wide text-text">
                    {state.budget.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-text-muted">
                  <span>{t("auction.totalCommitted", { amount: totalCommitted.toFixed(1) })}</span>
                  <span>/ {state.initialBudget.toFixed(1)}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                {t("auction.squadProgress", { count: state.squadSize })}
              </p>
            </div>

            {/* Mes enchères ce tour */}
            <div className="order-2 lg:order-3 lg:sticky lg:top-20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
                {t("auction.myBidsTitle")}
              </p>
              <div className="pixel-corners overflow-hidden border border-border bg-surface">
                {Object.keys(draftBids).length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">{t("auction.noBidsYet")}</p>
                ) : (
                  <div className="divide-y divide-border">
                    {Object.entries(draftBids).map(([playerId, amount]) => {
                      const player = allPlayers.find((p) => p.id === playerId);
                      if (!player) return null;
                      return (
                        <div key={playerId} className="flex items-center gap-2 px-3 py-2">
                          <PlayerAvatar player={player} size="xs" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-text">
                              {player.firstName} {player.lastName}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-accent-secondary">
                            {parseFloat(amount || "0").toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Centre : postes + liste de joueurs disponibles */}
            <div className="order-3 lg:order-2 flex flex-col gap-4">
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
                {POSITIONS.map((pos) => {
                  const remaining = remainingByPosition[pos] ?? 0;
                  const pending = bidsCountByPosition.get(pos) ?? 0;
                  const isActive = activePos === pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => {
                        setActivePos(pos);
                        setSearch("");
                      }}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-accent text-bg"
                          : "border border-border text-text-muted hover:border-accent/50 hover:text-text"
                      )}
                    >
                      {tLabels(`positionShort.${pos}`)}
                      <span className={remaining === 0 ? (isActive ? "text-bg/70" : "text-points-pos") : "opacity-50"}>
                        {2 - remaining}/2
                        {pending > 0 && ` (+${pending})`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                placeholder={t("build.searchPlaceholder", { position: tLabels(`position.${activePos}`).toLowerCase() })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={state.submitted}
                className="pixel-corners-sm w-full border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-shadow focus:border-accent focus:shadow-glow-accent focus:outline-none disabled:opacity-50"
              />

              <div className="pixel-corners overflow-hidden border border-border bg-surface">
                {(remainingByPosition[activePos] ?? 0) <= 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">{t("build.slotsFull")}</p>
                ) : filteredPlayers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">{t("build.noPlayersAvailable")}</p>
                ) : (
                  <motion.div
                    className="divide-y divide-border"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.02 } } }}
                  >
                    {filteredPlayers.slice(0, 40).map((player) => (
                      <motion.div
                        key={player.id}
                        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }}
                        className="flex w-full items-center gap-3 px-3 py-2.5"
                      >
                        <PlayerAvatar player={player} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">
                            {player.firstName} {player.lastName}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-text-muted">
                            <ClubLogo club={player.club} size="xs" />
                            {player.club.shortName}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={state.submitted}
                          value={draftBids[player.id] ?? ""}
                          onChange={(e) => setBid(player.id, player.position, e.target.value)}
                          placeholder={t("auction.bidAmountPlaceholder")}
                          className="w-20 shrink-0 rounded border border-border bg-bg px-2 py-1 text-right text-sm tabular-nums text-text focus:border-accent focus:outline-none disabled:opacity-50"
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] border-t border-border bg-bg/95 px-4 py-4 backdrop-blur-sm sm:bottom-0">
        <div className="mx-auto max-w-2xl">
          {error && <p className="mb-2 text-center text-sm text-points-neg">{error}</p>}
          {state.submitted ? (
            <p className="text-center text-sm text-text-muted">
              {t("auction.waitingForOthers", { submitted: state.submittedCount, total: state.memberCount })}
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={saveBids}
                disabled={saving || submitting}
                className="pixel-corners-sm flex-1 border border-border py-3 text-sm uppercase tracking-wide text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? t("common.validating") : t("auction.saveCta")}
              </button>
              <button
                onClick={handleSubmitRound}
                disabled={saving || submitting}
                className="flex-[2] rounded-lg bg-accent py-3 font-semibold text-bg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? t("common.validating") : t("auction.submitCta")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
