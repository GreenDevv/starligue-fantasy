"use client";

import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { GameweekStateBadge } from "@/components/gameweek/GameweekStateBadge";
import type { GameweekState, GameweekTone } from "@/lib/gameweek/state";

export interface GameweekStateBannerData {
  number: number;
  state: GameweekState;
  tone: GameweekTone;
  matchesFinished: number;
  matchesTotal: number;
  hasCorrection: boolean;
  correctionAt: string | null; // ISO
}

const TONE_BOX: Record<GameweekTone, string> = {
  neutral: "border-border bg-surface",
  danger: "border-points-neg/40 bg-points-neg/10",
  attention: "border-accent-secondary/40 bg-accent-secondary/10",
  confirmed: "border-points-pos/40 bg-points-pos/10",
};

// Bandeau d'état de journée. context="team" : ce que valent les points affichés.
// context="standings" : la fiabilité du classement.
export function GameweekStateBanner({
  data,
  context = "team",
  className,
}: {
  data: GameweekStateBannerData;
  context?: "team" | "standings";
  className?: string;
}) {
  const t = useTranslations("gameweek");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  // Rien à signaler : journée à venir, ou (contexte équipe) journée confirmée.
  if (data.state === "UPCOMING") return null;
  if (context === "team" && data.state === "CONFIRMED" && !data.hasCorrection) return null;

  let message: string;
  if (context === "standings") {
    message =
      data.state === "CONFIRMED"
        ? t("standings.confirmed", { number: data.number })
        : data.state === "LIVE"
          ? t("standings.live", { number: data.number })
          : t("standings.provisional", { number: data.number });
  } else {
    message =
      data.state === "LIVE"
        ? `${tCommon("matchday", { number: data.number })} · ${t("matchesProgress", {
            finished: data.matchesFinished,
            total: data.matchesTotal,
          })}`
        : `${tCommon("matchday", { number: data.number })} — ${t(`state.${data.state}.detail`)}`;
  }

  return (
    <div className={cn("pixel-corners flex flex-col gap-1.5 border p-3", TONE_BOX[data.tone], className)}>
      <div className="flex items-center gap-2">
        <GameweekStateBadge state={data.state} tone={data.tone} />
        <p className="min-w-0 flex-1 text-xs text-text">{message}</p>
      </div>
      {context === "team" && data.state !== "LIVE" && data.state !== "CONFIRMED" && (
        <p className="text-[11px] text-text-muted">{t("pointsMayChange")}</p>
      )}
      {data.hasCorrection && data.correctionAt && (
        <p className="text-[11px] text-accent-secondary">
          {t("correction", {
            date: format.dateTime(new Date(data.correctionAt), { day: "numeric", month: "short" }),
          })}
        </p>
      )}
    </div>
  );
}
