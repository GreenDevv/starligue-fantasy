"use client";

// Modal "récap de journée" — apparaît sur le dashboard à la première visite
// suivant une journée notée (ARCHITECTURE.md, voir memory gameweek_recap_modal).
// Une équipe (utilisateur × ligue) = un modal ; enchaînés en série si
// l'utilisateur a plusieurs équipes concernées (décision explicite plutôt qu'un
// seul modal agrégé — plus lisible, réutilise le même composant pour chacune).
import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon, CloseIcon } from "@/components/ui/icons";
import type { PendingGameweekRecap } from "@/lib/team/pending-gameweek-recap";

interface GameweekRecapModalProps {
  recaps: PendingGameweekRecap[];
}

export function GameweekRecapModal({ recaps }: GameweekRecapModalProps) {
  const t = useTranslations("dashboard");
  const [index, setIndex] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  const current = recaps[index];

  async function markSeenAndAdvance() {
    if (!current || dismissing) return;
    setDismissing(true);
    try {
      await fetch("/api/team/recap-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: current.teamId,
          mode: current.mode,
          gameweekNumber: current.gameweekNumber,
        }),
      });
    } catch {
      // Best-effort : si l'appel échoue, le modal réapparaîtra à la prochaine
      // visite plutôt que de bloquer la fermeture — pas gênant en soi.
    } finally {
      setIndex((i) => i + 1);
      setDismissing(false);
    }
  }

  if (typeof document === "undefined") return null;

  const positive = (current?.points ?? 0) >= 0;

  // `current` (pas juste un booléen `open`) pilote le rendu conditionnel à
  // l'intérieur d'AnimatePresence, plutôt qu'un early-return au-dessus qui
  // court-circuiterait tout le portail : c'est ce qui permet à la fermeture du
  // DERNIER récap (recaps épuisés) de jouer son animation de sortie au lieu de
  // disparaître instantanément (même piège que PlayerSeasonRecapTrigger).
  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm"
          onClick={markSeenAndAdvance}
        >
          <motion.div
            key={current.teamId}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="pixel-corners relative w-full max-w-xs border border-border bg-surface p-5 text-center shadow-lg"
          >
            <button
              onClick={markSeenAndAdvance}
              aria-label={t("dashboardView.close")}
              className="absolute right-3 top-3 text-text-muted transition-colors hover:text-text"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            <TrophyIcon className="mx-auto mb-2 h-8 w-8 text-accent" />

            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              {t("gameweekRecapModal.leagueLabel", { league: current.leagueName })}
            </p>
            <h2 className="mt-1 text-lg text-text">
              {t("gameweekRecapModal.title", { number: current.gameweekNumber })}
            </h2>

            <div
              className={`my-4 font-arcade text-5xl leading-none drop-shadow-[0_0_10px_currentColor] ${
                positive ? "text-points-pos" : "text-points-neg"
              }`}
            >
              {positive ? `+${current.points}` : current.points}
            </div>

            <p className="text-sm text-text-muted">
              {t(positive ? "gameweekRecapModal.subtitlePositive" : "gameweekRecapModal.subtitleNegative", {
                team: current.teamName,
              })}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/team/history/${current.gameweekId}?league=${current.leagueId}`}
                onClick={markSeenAndAdvance}
                className="pixel-corners-sm bg-accent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90"
              >
                {t("gameweekRecapModal.detailCta")} →
              </Link>
              <button
                onClick={markSeenAndAdvance}
                className="py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
              >
                {t("dashboardView.close")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
