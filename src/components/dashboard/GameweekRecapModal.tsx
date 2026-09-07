"use client";

// Modal "récap de journée" — apparaît sur le dashboard à la première visite
// suivant une journée notée (ARCHITECTURE.md §24, voir memory gameweek_recap_modal
// + fantasy_standings_history_and_recap_v2). Une équipe (utilisateur × ligue) = un
// modal ; enchaînés en série si l'utilisateur a plusieurs équipes concernées.
//
// v2 : contenu enrichi (compo complète + points par joueur, meilleur titulaire,
// classement général + évolution ▲/▼) + bouton « Partager mon récap » (image
// générée par /api/og/gameweek-recap — Web Share sur mobile, téléchargement
// sinon). Le CTA « Voir le détail » est conservé EN PLUS du partage.
import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TrophyIcon, CloseIcon } from "@/components/ui/icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PositionBadge } from "@/components/ui/Badge";
import type { Position } from "@/lib/squad/validation";
import type { PendingGameweekRecap } from "@/lib/team/pending-gameweek-recap";
import type { LineupPlayerDetail } from "@/lib/team/gameweek-lineup-detail";

interface GameweekRecapModalProps {
  recaps: PendingGameweekRecap[];
}

function formatPoints(n: number | null): string {
  if (n === null) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function PlayerLine({ p }: { p: LineupPlayerDetail }) {
  const positive = (p.points ?? 0) >= 0;
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
      <span className="relative shrink-0">
        <PlayerAvatar
          player={{ firstName: p.firstName, lastName: p.lastName, photoUrl: p.photoUrl, position: p.position as Position }}
          size="xs"
        />
        {p.isCaptain && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full border border-bg bg-accent-secondary text-[7px] font-bold leading-none text-bg">
            C
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-text">
        {p.firstName.charAt(0)}. {p.lastName}
      </span>
      <PositionBadge position={p.position as Position} />
      <span
        className={`w-9 shrink-0 text-right font-arcade text-sm leading-none ${
          p.points === null || p.points === 0
            ? "text-text-muted"
            : positive
              ? "text-points-pos"
              : "text-points-neg"
        }`}
      >
        {formatPoints(p.points)}
      </span>
    </div>
  );
}

export function GameweekRecapModal({ recaps }: GameweekRecapModalProps) {
  const t = useTranslations("dashboard");
  const [index, setIndex] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [sharing, setSharing] = useState(false);

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
      // Best-effort : le modal réapparaîtra à la prochaine visite plutôt que de
      // bloquer la fermeture.
    } finally {
      setIndex((i) => i + 1);
      setDismissing(false);
    }
  }

  async function shareRecap() {
    if (!current || sharing) return;
    setSharing(true);
    try {
      const res = await fetch(
        `/api/og/gameweek-recap?mode=${current.mode}&teamId=${current.teamId}&gameweekId=${current.gameweekId}`
      );
      if (!res.ok) throw new Error("og failed");
      const blob = await res.blob();
      const file = new File([blob], `recap-j${current.gameweekNumber}.png`, { type: "image/png" });
      const shareData = {
        files: [file],
        title: t("gameweekRecapModal.title", { number: current.gameweekNumber }),
      };
      if (typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // silencieux : partage annulé ou indisponible, rien à signaler
    } finally {
      setSharing(false);
    }
  }

  if (typeof document === "undefined") return null;

  const positive = (current?.points ?? 0) >= 0;
  const starters = current?.players.filter((p) => p.role === "STARTER") ?? [];
  const bench = current?.players.filter((p) => p.role === "BENCH") ?? [];
  const rank = current?.rank ?? null;
  const top = current?.topPerformer ?? null;

  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-bg/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={markSeenAndAdvance}
        >
          <motion.div
            key={current.teamId}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="pixel-corners relative flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden border border-accent/60 bg-surface shadow-[0_-8px_40px_-8px_rgba(45,212,191,0.25)] sm:max-h-[88vh]"
          >
            <button
              onClick={markSeenAndAdvance}
              aria-label={t("dashboardView.close")}
              className="absolute right-3 top-3 z-10 text-text-muted transition-colors hover:text-text"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
              <div className="text-center">
                <TrophyIcon className="mx-auto mb-2 h-7 w-7 text-accent" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  {t("gameweekRecapModal.leagueLabel", { league: current.leagueName })}
                </p>
                <h2 className="mt-0.5 text-lg text-text">
                  {t("gameweekRecapModal.title", { number: current.gameweekNumber })}
                </h2>
                <div
                  className={`my-2 font-arcade text-5xl leading-none drop-shadow-[0_0_10px_currentColor] ${
                    positive ? "text-points-pos" : "text-points-neg"
                  }`}
                >
                  {formatPoints(current.points)}
                </div>
                <p className="text-xs text-text-muted">
                  {t(
                    positive ? "gameweekRecapModal.subtitlePositive" : "gameweekRecapModal.subtitleNegative",
                    { team: current.teamName }
                  )}
                </p>
              </div>

              {rank && (
                <div className="mt-4 flex items-center gap-3 border border-border bg-bg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                      {t("gameweekRecapModal.globalRank")}
                    </p>
                    <p className="text-lg leading-none text-text">
                      #{rank.globalRank}
                      <span className="ml-1 text-xs text-text-muted">/ {rank.totalTeams}</span>
                    </p>
                  </div>
                  {rank.globalDelta !== null && rank.globalDelta !== 0 && (
                    <span
                      className={`ml-auto inline-flex items-center gap-1 px-2 py-1 text-sm font-bold ${
                        rank.globalDelta > 0
                          ? "bg-points-pos/12 text-points-pos"
                          : "bg-points-neg/12 text-points-neg"
                      }`}
                    >
                      {rank.globalDelta > 0 ? "▲" : "▼"} {Math.abs(rank.globalDelta)}
                    </span>
                  )}
                </div>
              )}

              {top && (
                <div className="mt-3 flex items-center gap-3 border border-border bg-gradient-to-br from-accent/12 to-accent-secondary/10 p-2.5">
                  <PlayerAvatar
                    player={{ firstName: top.firstName, lastName: top.lastName, photoUrl: top.photoUrl, position: top.position as Position }}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-accent">
                      {t("gameweekRecapModal.topPerformer")}
                    </p>
                    <p className="truncate text-sm font-semibold text-text">
                      {top.firstName} {top.lastName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-text-muted">
                      <ClubLogo club={top.club} size="xs" />
                      {top.club.shortName}
                    </p>
                  </div>
                  <span className="font-arcade text-2xl leading-none text-accent-secondary">
                    {formatPoints(top.points)}
                  </span>
                </div>
              )}

              {starters.length > 0 && (
                <>
                  <p className="mb-1 mt-4 px-1 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                    {t("gameweekRecapModal.starters")}
                  </p>
                  <div className="divide-y divide-border border border-border bg-bg">
                    {starters.map((p) => (
                      <PlayerLine key={p.playerId} p={p} />
                    ))}
                  </div>
                </>
              )}

              {bench.length > 0 && (
                <>
                  <p className="mb-1 mt-3 px-1 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
                    {t("gameweekRecapModal.bench")} <span className="text-text-muted/60">· ×0,5</span>
                  </p>
                  <div className="divide-y divide-border border border-border bg-bg opacity-90">
                    {bench.map((p) => (
                      <PlayerLine key={p.playerId} p={p} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border bg-surface px-5 py-3">
              <button
                onClick={shareRecap}
                disabled={sharing}
                className="pixel-corners-sm bg-accent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90 disabled:opacity-60"
              >
                {sharing ? t("gameweekRecapModal.sharePreparing") : t("gameweekRecapModal.shareCta")}
              </button>
              <Link
                href={`/team/history/${current.gameweekId}?league=${current.leagueId}`}
                onClick={markSeenAndAdvance}
                className="pixel-corners-sm border border-border bg-surface px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-text transition-colors hover:border-accent/50"
              >
                {t("gameweekRecapModal.detailCta")} →
              </Link>
              <button
                onClick={markSeenAndAdvance}
                className="py-1 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
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
