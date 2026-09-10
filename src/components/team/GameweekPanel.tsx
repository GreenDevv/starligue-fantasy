"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { deadlineTier, formatCountdown, type DeadlineTier } from "@/lib/team/deadline-countdown";
import type { BonusType } from "@/components/BonusPicker";

interface GameweekPanelProps {
  gameweekNumber: number;
  deadlineAt: string; // ISO
  leagueId: string;
  captainName: string | null;
  pendingBonus: BonusType | null;
  predictions: { made: number; total: number } | null;
}

const TIER_STYLES: Record<DeadlineTier, string> = {
  calm: "border-border bg-surface",
  amber: "border-accent-secondary/40 bg-accent-secondary/10",
  red: "border-points-neg/40 bg-points-neg/10 shadow-glow-red",
};

const TIER_TEXT: Record<DeadlineTier, string> = {
  calm: "text-accent",
  amber: "text-accent-secondary",
  red: "text-points-neg",
};

export function GameweekPanel({
  gameweekNumber,
  deadlineAt,
  leagueId,
  captainName,
  pendingBonus,
  predictions,
}: GameweekPanelProps) {
  const t = useTranslations("team");
  const tLabels = useTranslations("labels");
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const deadline = new Date(deadlineAt).getTime();
    function tick() {
      setRemaining(deadline - Date.now());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  if (remaining !== null && remaining < 0) return null;

  const tier = remaining === null ? "calm" : deadlineTier(remaining);
  const predictionsDone = !predictions || predictions.made >= predictions.total;
  const allDone = predictionsDone && captainName !== null;

  return (
    <div className={cn("pixel-corners flex flex-col gap-2.5 border p-4", TIER_STYLES[tier])}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          {t("gameweekPanel.title")}
          <span className="ml-1.5 text-text">{t("common.matchday", { number: gameweekNumber })}</span>
        </p>
        <span
          className={cn(
            "font-arcade text-lg tabular-nums leading-none",
            TIER_TEXT[tier],
            tier !== "calm" && "drop-shadow-[0_0_6px_currentColor]"
          )}
        >
          {remaining === null ? "—" : formatCountdown(remaining)}
        </span>
      </div>

      {allDone ? (
        <p className="text-sm text-points-pos">{t("gameweekPanel.ready", { number: gameweekNumber })}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          <ChecklistRow done label={t("gameweekPanel.lineupDone")} />

          <ChecklistRow
            done={captainName !== null}
            label={
              captainName
                ? `${t("view.captainLabel")} · ${captainName}`
                : t("view.noCaptain")
            }
            action={{ href: `/team/start?league=${leagueId}`, label: t("view.changeCaptain") }}
          />

          {predictions && (
            <ChecklistRow
              done={predictionsDone}
              label={`${t("gameweekPanel.predictions")} · ${predictions.made}/${predictions.total}`}
              action={
                predictionsDone
                  ? undefined
                  : { href: "/predictions", label: t("gameweekPanel.predictionsCta") }
              }
            />
          )}

          <ChecklistRow
            done={pendingBonus !== null}
            neutral
            label={`${t("gameweekPanel.bonus")} · ${
              pendingBonus ? tLabels(`bonus.${pendingBonus}`) : t("gameweekPanel.noBonus")
            }`}
          />
        </ul>
      )}
    </div>
  );
}

function ChecklistRow({
  done,
  neutral,
  label,
  action,
}: {
  done: boolean;
  neutral?: boolean;
  label: string;
  action?: { href: string; label: string };
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
          neutral
            ? "border-border text-text-muted"
            : done
              ? "border-points-pos bg-points-pos/15 text-points-pos"
              : "border-accent-secondary text-accent-secondary"
        )}
      >
        {done ? "✓" : neutral ? "·" : ""}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", done && !neutral ? "text-text-muted" : "text-text")}>
        {label}
      </span>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 text-xs uppercase tracking-wide text-accent-secondary transition-colors hover:text-accent-secondary/80"
        >
          {action.label} →
        </Link>
      )}
    </li>
  );
}
