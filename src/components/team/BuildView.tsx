"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { POSITIONS } from "@/lib/squad/validation";
import { BudgetGauge } from "@/components/market/BudgetGauge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { SquadSlots, type SlotPlayer } from "@/components/squad/SquadSlots";
import { PlayerSeasonRecapTrigger } from "@/components/players/PlayerSeasonRecapTrigger";
import { AuctionBuildView } from "@/components/team/AuctionBuildView";
import { cn } from "@/lib/utils";
import type { SeasonMode } from "@/lib/team/active-team-context";
import { resolveApiError } from "@/lib/api/error-messages";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  valuationPending?: boolean;
  photoUrl?: string | null;
  club: { id: string; shortName: string; name: string; logoUrl?: string | null };
}

type SquadState = Record<Position, [Player | null, Player | null]>;

function emptySquad(): SquadState {
  return Object.fromEntries(POSITIONS.map((pos) => [pos, [null, null]])) as SquadState;
}

export function BuildView({ mode }: { mode: SeasonMode }) {
  const tLabels = useTranslations("labels");
  const t = useTranslations("team");
  const tRoot = useTranslations();
  const router = useRouter();
  const leagueId = useSearchParams().get("league");
  const leagueSuffix = leagueId ? `?league=${leagueId}` : "";
  // Classes Tailwind statiques (jamais interpolées : le JIT ne détecte pas les
  // noms de classe construits dynamiquement, ex. `bg-${accent}`).
  const isSimulation = mode === "simulation";
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [squad, setSquad] = useState<SquadState>(emptySquad);
  const [activePos, setActivePos] = useState<Position>("GK");
  const [search, setSearch] = useState("");
  const [initialBudget, setInitialBudget] = useState(100);
  const [maxPlayersPerClub, setMaxPlayersPerClub] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyValidated, setAlreadyValidated] = useState(false);
  const [locked, setLocked] = useState(false);
  const [auctionLeague, setAuctionLeague] = useState<{ leagueId: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/players?perPage=500").then((r) => r.json()),
      fetch(`/api/my-team${leagueSuffix}`).then((r) => r.json()),
    ]).then(
      ([
        playersRes,
        teamRes,
      ]: [
        { data?: { players: Player[] } },
        {
          data?: {
            leagueId: string;
            leagueMode?: "CLASSIC" | "AUCTION";
            initialBudget: number;
            maxPlayersPerClub: number;
            isValidated: boolean;
            seasonStarted: boolean;
            squad: Array<{ role: string; player: Player }>;
          };
        },
      ]) => {
        if (playersRes.data?.players) setAllPlayers(playersRes.data.players);
        // initialBudget = enveloppe totale (GameConfig), pas team.budget qui est le solde
        // restant post-validation — sinon un effectif déjà validé (quasi tout dépensé)
        // apparaît systématiquement "en dépassement" dès la réouverture de l'écran.
        if (teamRes.data?.initialBudget) setInitialBudget(teamRes.data.initialBudget);
        if (teamRes.data?.maxPlayersPerClub) setMaxPlayersPerClub(teamRes.data.maxPlayersPerClub);
        // Ligue en mode Enchères (§18 ARCHITECTURE.md) : le wizard à prix fixe ne
        // s'applique pas, l'effectif se construit tour par tour sur un écran dédié.
        if (teamRes.data?.leagueMode === "AUCTION" && teamRes.data.leagueId) {
          setAuctionLeague({ leagueId: teamRes.data.leagueId });
          setLoading(false);
          return;
        }
        if (teamRes.data?.isValidated && (teamRes.data.squad?.length ?? 0) === 14) {
          setAlreadyValidated(true);
          // Rebuild complet interdit une fois la saison commencée (voir
          // src/lib/squad/season-lock.ts) — Transferts/Trades restent ouverts.
          setLocked(teamRes.data.seasonStarted);
          const squadByPos = emptySquad();
          for (const sq of teamRes.data.squad) {
            const p = sq.player;
            const pos = p.position as Position;
            if (!squadByPos[pos][0]) {
              (squadByPos[pos] as [Player | null, Player | null])[0] = p;
            } else {
              (squadByPos[pos] as [Player | null, Player | null])[1] = p;
            }
          }
          setSquad(squadByPos);
        }
        setLoading(false);
      }
    );
  }, [leagueSuffix]);

  const selectedIds = useMemo(
    () =>
      new Set(
        Object.values(squad)
          .flat()
          .filter(Boolean)
          .map((p) => p!.id)
      ),
    [squad]
  );

  const spent = useMemo(
    () =>
      Object.values(squad)
        .flat()
        .filter(Boolean)
        .reduce((s, p) => s + p!.marketValue, 0),
    [squad]
  );

  // Nombre de joueurs déjà sélectionnés par club — sert à empêcher visuellement
  // de dépasser MAX_PLAYERS_PER_CLUB avant même le rejet serveur (validateSquad).
  const clubCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of Object.values(squad).flat()) {
      if (!p) continue;
      counts.set(p.club.id, (counts.get(p.club.id) ?? 0) + 1);
    }
    return counts;
  }, [squad]);

  const squadFull = POSITIONS.every((pos) => squad[pos][0] !== null && squad[pos][1] !== null);
  const budgetOk = spent <= initialBudget;
  const canValidate = squadFull && budgetOk;
  const totalPicked = Object.values(squad).flat().filter(Boolean).length;

  const filteredPlayers = useMemo(
    () =>
      allPlayers.filter(
        (p) =>
          p.position === activePos &&
          !selectedIds.has(p.id) &&
          (search === "" ||
            `${p.firstName} ${p.lastName} ${p.club.shortName}`
              .toLowerCase()
              .includes(search.toLowerCase()))
      ),
    [allPlayers, activePos, selectedIds, search]
  );

  function addPlayer(player: Player) {
    const slots = squad[player.position];
    const slotIdx: 0 | 1 | null =
      slots[0] === null ? 0 : slots[1] === null ? 1 : null;
    if (slotIdx === null) return;

    setSquad((prev) => {
      const next = [...prev[player.position]] as [Player | null, Player | null];
      next[slotIdx] = player;
      return { ...prev, [player.position]: next };
    });
    setSearch("");

    // Auto-advance when second slot filled
    if (slotIdx === 1) {
      const idx = POSITIONS.indexOf(player.position);
      const nextPos = POSITIONS[idx + 1];
      if (nextPos) setActivePos(nextPos);
    }
  }

  function removePlayer(pos: Position, idx: 0 | 1) {
    setSquad((prev) => {
      const next = [...prev[pos]] as [Player | null, Player | null];
      next[idx] = null;
      return { ...prev, [pos]: next };
    });
  }

  function handleSlotClick(pos: Position, idx: 0 | 1, player: SlotPlayer | null) {
    if (player) {
      removePlayer(pos, idx);
    } else {
      setActivePos(pos);
      setSearch("");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const playerIds = Object.values(squad)
      .flat()
      .filter(Boolean)
      .map((p) => p!.id);
    try {
      const res = await fetch("/api/my-team/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds, ...(leagueId ? { leagueId } : {}) }),
      });
      const data = await res.json() as {
        data?: { success: boolean };
        error?: {
          code?: string;
          message: string;
          details?: Array<{ code: string; clubId?: string; count?: number; max?: number }>;
        };
      };
      if (data.data?.success) {
        router.push(`/team/start${leagueSuffix}`);
      } else if (data.error?.code === "NO_ACTIVE_LEAGUE") {
        router.push("/leagues");
      } else {
        const clubIssue = data.error?.details?.find((d) => d.code === "TOO_MANY_PLAYERS_FROM_CLUB");
        if (clubIssue) {
          const clubName = allPlayers.find((p) => p.club.id === clubIssue.clubId)?.club.shortName ?? t("build.unknownClub");
          setError(t("build.tooManyFromClub", { club: clubName, count: clubIssue.count ?? 0, max: clubIssue.max ?? 0 }));
        } else {
          setError(resolveApiError(tRoot, "team", data.error?.code));
        }
      }
    } catch {
      setError(resolveApiError(tRoot, "team", "NETWORK"));
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">{t("build.loadingPlayers")}</p>
      </div>
    );
  }

  if (auctionLeague) {
    return <AuctionBuildView leagueId={auctionLeague.leagueId} leagueSuffix={leagueSuffix} />;
  }

  if (locked) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg text-text">{t("build.lockedTitle")}</p>
        <p className="max-w-sm text-sm text-text-muted">
          {t("build.lockedBody")}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/team/transfers${leagueSuffix}`)}
            className="pixel-corners-sm bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90"
          >
            {t("common.transfers")}
          </button>
          <button
            onClick={() => router.push(`/team/trades${leagueSuffix}`)}
            className="pixel-corners-sm border border-border px-4 py-2 text-sm uppercase tracking-wide text-text-muted transition-colors hover:text-text"
          >
            {t("common.trades")}
          </button>
        </div>
      </div>
    );
  }

  const posCompleted = POSITIONS.filter(
    (pos) => squad[pos][0] !== null && squad[pos][1] !== null
  ).length;

  return (
    <div className="pb-36">
      {/* Header */}
      <div className="mb-4">
        {mode === "simulation" && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-secondary">
            {t("common.simulationModeSeason")}
          </p>
        )}
        <h1 className="text-2xl text-text">
          {alreadyValidated ? t("build.titleEdit") : t("build.titleCreate")}
        </h1>
      </div>

      {/* Breakout : plus large que la colonne mobile-first du layout à partir de lg */}
      <div className="lg:relative lg:left-1/2 lg:right-1/2 lg:-mx-[50vw] lg:w-screen">
        <div className="lg:mx-auto lg:max-w-6xl lg:px-6">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[220px_1fr_320px] lg:items-start lg:gap-6">
            {/* Budget — sticky en haut (mobile) / colonne gauche sticky (desktop) */}
            <div className="order-1 sticky top-12 lg:top-20 z-[5] -mx-4 border-b border-border bg-bg/95 px-4 pb-3 pt-2 backdrop-blur-sm lg:mx-0 lg:border-none lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
              <p className="mb-1.5 text-xs text-text-muted">
                {t("build.progress", { completed: posCompleted, picked: totalPicked })}
              </p>
              <BudgetGauge budget={initialBudget} spent={spent} />
            </div>

            {/* Effectif en cours de sélection — condensé sous le budget (mobile) /
                colonne droite sticky (desktop). Pas de terrain ici. */}
            <div className="order-2 lg:order-3 lg:sticky lg:top-20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
                {t("build.squadHint")}
              </p>
              <SquadSlots squad={squad} onSlotClick={handleSlotClick} activePosition={activePos} />
            </div>

            {/* Centre : postes, recherche, liste des joueurs */}
            <div className="order-3 lg:order-2 flex flex-col gap-4">
              {/* Position tabs */}
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
                {POSITIONS.map((pos) => {
                  const filled = squad[pos].filter(Boolean).length;
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
                          ? isSimulation
                            ? "bg-accent-secondary text-bg"
                            : "bg-accent text-bg"
                          : isSimulation
                            ? "border border-border text-text-muted hover:border-accent-secondary/50 hover:text-text"
                            : "border border-border text-text-muted hover:border-accent/50 hover:text-text"
                      )}
                    >
                      {tLabels(`positionShort.${pos}`)}
                      <span
                        className={
                          filled === 2
                            ? isActive
                              ? "text-bg/70"
                              : "text-points-pos"
                            : "opacity-50"
                        }
                      >
                        {filled}/2
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Player search */}
              <input
                type="text"
                placeholder={t("build.searchPlaceholder", { position: tLabels(`position.${activePos}`).toLowerCase() })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pixel-corners-sm w-full border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-shadow focus:border-accent focus:shadow-glow-accent focus:outline-none"
              />

              {/* Player list */}
              <div className="pixel-corners overflow-hidden border border-border bg-surface">
                {filteredPlayers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">
                    {squad[activePos][0] !== null && squad[activePos][1] !== null
                      ? t("build.slotsFull")
                      : t("build.noPlayersAvailable")}
                  </p>
                ) : (
                  <motion.div
                    className="divide-y divide-border"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.02 } } }}
                  >
                    {filteredPlayers.slice(0, 40).map((player) => {
                      const slotsFull =
                        squad[activePos][0] !== null && squad[activePos][1] !== null;
                      const wouldExceedBudget =
                        !selectedIds.has(player.id) &&
                        spent + player.marketValue > initialBudget;
                      const clubCount = clubCounts.get(player.club.id) ?? 0;
                      const wouldExceedClubLimit = !selectedIds.has(player.id) && clubCount >= maxPlayersPerClub;
                      return (
                        <motion.button
                          key={player.id}
                          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }}
                          onClick={() => addPlayer(player)}
                          disabled={slotsFull || wouldExceedBudget || wouldExceedClubLimit}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-border/20 active:bg-border/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <PlayerAvatar player={player} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text">
                              {player.firstName} {player.lastName}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-text-muted">
                              <ClubLogo club={player.club} size="xs" />
                              {player.club.shortName}
                              {clubCount > 0 && (
                                <span className={wouldExceedClubLimit ? "text-points-neg" : "text-text-muted"}>
                                  · {clubCount}/{maxPlayersPerClub}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="shrink-0 flex items-center gap-1.5">
                            {/* Récap 2025/26 : pas de "saison précédente" en mode simulation (le
                                joueur affiché EST déjà celui de 2025/26). */}
                            {!isSimulation && (
                              <PlayerSeasonRecapTrigger
                                playerId={player.id}
                                isGoalkeeper={player.position === "GK"}
                              />
                            )}
                            {player.valuationPending && (
                              <span className="rounded-full bg-accent-secondary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-secondary">
                                ND
                              </span>
                            )}
                            <span
                              className={`text-sm font-semibold tabular-nums ${
                                wouldExceedBudget ? "text-points-neg" : "text-accent-secondary"
                              }`}
                            >
                              {player.marketValue.toFixed(1)}M
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky validation footer — bottom décalé au-dessus de la MobileTabBar sous
          sm: (sinon le bouton se retrouve sous la nav mobile, inaccessible). */}
      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] border-t border-border bg-bg/95 px-4 py-4 backdrop-blur-sm sm:bottom-0">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 text-center text-sm text-points-neg">{error}</p>
          )}
          {!canValidate && (
            <p className="mb-2 text-center text-xs text-text-muted">
              {!squadFull
                ? t("build.missingPlayers", { count: 14 - totalPicked })
                : t("build.budgetExceeded", { amount: (spent - initialBudget).toFixed(1) })}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canValidate || submitting}
            className={cn(
              "w-full rounded-lg py-3 font-semibold text-bg transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              isSimulation ? "bg-accent-secondary hover:bg-accent-secondary/90" : "bg-accent hover:bg-accent/90"
            )}
          >
            {submitting
              ? t("common.validating")
              : alreadyValidated
                ? t("build.updateCta")
                : t("build.validateCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
