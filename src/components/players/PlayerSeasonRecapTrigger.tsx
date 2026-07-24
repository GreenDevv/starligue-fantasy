"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { InfoIcon } from "@/components/ui/icons";
import type { PlayerSeasonRecap } from "@/lib/players/season-recap";

interface PlayerSeasonRecapTriggerProps {
  playerId: string;
  isGoalkeeper: boolean;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; recap: PlayerSeasonRecap | null };

// Déclencheur (icône ⓘ) + popup portalé — le conteneur liste de joueurs a
// `overflow-hidden` (pixel-corners), un popover positionné en absolu serait
// donc rogné ; on le monte via portal en position fixed, calée sur le
// getBoundingClientRect de l'icône. Survol (desktop) ou tap (mobile), fetch
// paresseux au premier hover/tap, mis en cache ensuite pour ce trigger.
export function PlayerSeasonRecapTrigger({ playerId, isGoalkeeper }: PlayerSeasonRecapTriggerProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [state, setState] = useState<FetchState>({ status: "idle" });

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function show() {
    clearCloseTimer();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
    if (state.status === "idle") {
      setState({ status: "loading" });
      fetch(`/api/players/${playerId}/season-recap`)
        .then((r) => r.json())
        .then((res: { data: PlayerSeasonRecap | null }) => setState({ status: "done", recap: res.data ?? null }))
        .catch(() => setState({ status: "done", recap: null }));
    }
  }

  function scheduleHide() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <>
      {/*
        Pas de role="button"/tabIndex ici : ce trigger est imbriqué dans le
        motion.button de la ligne joueur (BuildView) — un vrai élément
        interactif imbriqué dans un <button> serait du HTML invalide. Le clic
        (stopPropagation) et le survol restent fonctionnels ; seul le focus
        clavier dédié à l'icône est sacrifié (feature secondaire, hover-first).
      */}
      <span
        ref={triggerRef}
        aria-label="Statistiques saison 2025/2026"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : show();
        }}
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-text-muted transition-colors hover:text-accent"
      >
        <InfoIcon className="h-4 w-4" />
      </span>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 100 }}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleHide}
                className="pixel-corners-sm w-52 border border-border bg-surface p-2.5 shadow-lg"
              >
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                  Saison 2025/2026
                </p>
                {state.status !== "done" ? (
                  <p className="py-1 text-xs text-text-muted">Chargement…</p>
                ) : state.recap === null ? (
                  <p className="py-1 text-xs text-text-muted">Pas de stats 2025/2026 disponibles.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    <RecapStat label="Matchs" value={state.recap.matchesPlayed} />
                    <RecapStat label="Note LNH" value={state.recap.avgRating ?? "—"} />
                    {isGoalkeeper ? (
                      <>
                        <RecapStat label="Arrêts" value={state.recap.saves ?? "—"} />
                        <RecapStat
                          label="% Arrêts"
                          value={state.recap.savePercentage !== null ? `${state.recap.savePercentage}%` : "—"}
                        />
                      </>
                    ) : (
                      <>
                        <RecapStat label="Buts" value={state.recap.goalsTotal ?? "—"} />
                        <RecapStat label="Passes déc." value={state.recap.assists ?? "—"} />
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

function RecapStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-arcade text-sm tracking-wide text-text">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}
