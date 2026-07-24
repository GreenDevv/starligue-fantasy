"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface DeadlineBannerProps {
  initialGameweek: { number: number; deadlineAt: string } | null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Deadline passée";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h >= 48) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}j ${rh}h${String(m).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function DeadlineBanner({ initialGameweek }: DeadlineBannerProps) {
  // `Date.now()` ne doit jamais être évalué pendant le rendu initial (SSR et
  // hydratation client tournent à des instants réels différents, donc le texte
  // du compte à rebours diffère d'une seconde → erreur d'hydratation React).
  // On démarre à `null` (identique serveur/client) et on ne calcule le temps
  // restant que dans useEffect, qui ne s'exécute jamais côté serveur.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!initialGameweek) return;
    const deadline = new Date(initialGameweek.deadlineAt).getTime();

    function tick() {
      setRemaining(deadline - Date.now());
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [initialGameweek]);

  if (!initialGameweek || remaining === null || remaining < 0) return null;

  const isRed = remaining < 2 * 3_600_000;
  const isAmber = !isRed && remaining < 24 * 3_600_000;
  const tier = isRed ? "red" : isAmber ? "amber" : "calm";

  return (
    <motion.div
      key={tier}
      initial={{ scaleY: 0.85, opacity: 0.5 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      style={{ transformOrigin: "top" }}
      className={[
        "relative overflow-hidden border-b px-4 py-1 text-center text-sm",
        isRed
          ? "border-points-neg/40 bg-points-neg/10 text-points-neg shadow-glow-red"
          : isAmber
            ? "border-accent-secondary/40 bg-accent-secondary/10 text-accent-secondary shadow-glow-amber"
            : "border-border bg-surface/50 text-text-muted",
      ].join(" ")}
    >
      <span className="font-display text-xs uppercase tracking-wide">J{initialGameweek.number}</span>
      {" · "}
      <span
        className={[
          "font-arcade text-lg tabular-nums tracking-wide",
          isRed || isAmber ? "drop-shadow-[0_0_6px_currentColor]" : "",
        ].join(" ")}
      >
        {formatCountdown(remaining)}
      </span>
    </motion.div>
  );
}
