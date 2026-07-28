"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { SeasonMode } from "@/lib/team/active-team-context";

const OPTIONS: { mode: SeasonMode; label: string }[] = [
  { mode: "live", label: "26/27" },
  { mode: "simulation", label: "Simu 25/26" },
];

// Toggle de saison — placé dans le header à côté du logo, comme un sélecteur de
// thème. La valeur initiale vient du cookie httpOnly lu côté serveur (layout) :
// pas de state client persistant au-delà de ce cookie, chaque navigation server
// component relit resolveSeasonMode().
export function SeasonToggle({ initialMode }: { initialMode: SeasonMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<SeasonMode>(initialMode);
  const [isPending, startTransition] = useTransition();

  function select(next: SeasonMode) {
    if (next === mode || isPending) return;
    setMode(next);
    startTransition(async () => {
      await fetch("/api/season-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      router.refresh();
    });
  }

  return (
    <div
      className="pixel-corners-sm flex items-center border border-border bg-surface p-0.5 text-xs"
      role="radiogroup"
      aria-label="Saison"
    >
      {OPTIONS.map(({ mode: optionMode, label }) => {
        const active = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(optionMode)}
            disabled={isPending}
            className={cn(
              "rounded-[3px] px-2 py-1 font-semibold uppercase tracking-wide transition-colors disabled:cursor-wait",
              active
                ? optionMode === "simulation"
                  ? "bg-accent-secondary text-bg shadow-glow-amber"
                  : "bg-accent text-bg shadow-glow-accent"
                : "text-text-muted hover:text-text"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
