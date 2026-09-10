import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GameweekState, GameweekTone } from "@/lib/gameweek/state";

const TONE_CLASS: Record<GameweekTone, string> = {
  neutral: "border-border text-text-muted",
  danger: "border-points-neg/50 text-points-neg shadow-glow-red",
  attention: "border-accent-secondary/50 text-accent-secondary shadow-glow-amber",
  confirmed: "border-points-pos/50 text-points-pos",
};

const DOT_CLASS: Record<GameweekTone, string> = {
  neutral: "bg-text-muted",
  danger: "bg-points-neg",
  attention: "bg-accent-secondary",
  confirmed: "bg-points-pos",
};

// Pastille d'état d'une journée — 🟡 en cours / 🟠 provisoire / 🟢 confirmée.
// Le point pulse quand des matchs sont en cours (tone "danger").
export function GameweekStateBadge({
  state,
  tone,
  className,
  size = "sm",
}: {
  state: GameweekState;
  tone: GameweekTone;
  className?: string;
  size?: "xs" | "sm";
}) {
  const t = useTranslations("gameweek");
  if (state === "UPCOMING") return null;

  return (
    <span
      className={cn(
        "pixel-corners-sm inline-flex shrink-0 items-center gap-1.5 border font-semibold uppercase tracking-wide",
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        TONE_CLASS[tone],
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {tone === "danger" && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", DOT_CLASS[tone])} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOT_CLASS[tone])} />
      </span>
      {t(`state.${state}.badge`)}
    </span>
  );
}
