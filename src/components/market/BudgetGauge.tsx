"use client";

import { useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { useTranslations } from "next-intl";

interface BudgetGaugeProps {
  budget: number;
  spent: number;
}

// Compteur qui s'anime vers sa nouvelle valeur au lieu de sauter instantanément
// (achat/vente sur le marché) — cohérent avec l'esprit "jauge de vie rétro".
function useAnimatedValue(target: number) {
  const spring = useSpring(target, { stiffness: 260, damping: 30 });
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    spring.set(target);
  }, [target, spring]);

  useEffect(() => spring.on("change", (v) => setDisplay(v)), [spring]);

  return display;
}

export function BudgetGauge({ budget, spent }: BudgetGaugeProps) {
  const t = useTranslations("market");
  const remaining = budget - spent;
  const pct = Math.min(100, (spent / budget) * 100);
  const over = remaining < 0;
  const filledSegments = Math.round((pct / 100) * 20);
  const animatedRemaining = useAnimatedValue(Math.abs(remaining));
  const animatedPct = useAnimatedValue(pct);

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide text-text-muted">
        <span>{t("budget.label")}</span>
        <span
          className={`font-arcade text-base tabular-nums tracking-wide ${over ? "text-points-neg drop-shadow-[0_0_6px_currentColor]" : "text-text"}`}
        >
          {over
            ? t("budget.over", { value: animatedRemaining.toFixed(1) })
            : t("budget.remaining", { value: animatedRemaining.toFixed(1) })}
        </span>
      </div>
      {/* Barre segmentée façon jauge de vie rétro */}
      <div
        className="flex h-3 gap-[2px] overflow-hidden rounded-sm bg-border p-[2px]"
        role="progressbar"
        aria-valuenow={Math.round(animatedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{ opacity: i < filledSegments ? 1 : 0 }}
            transition={{ duration: 0.25, delay: i < filledSegments ? i * 0.012 : 0 }}
            className={`h-full flex-1 ${over ? "bg-points-neg shadow-glow-red" : "bg-accent shadow-glow-accent"}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-muted">
        <span>{t("budget.spent", { value: spent.toFixed(1) })}</span>
        <span>/ {budget.toFixed(1)}M</span>
      </div>
    </div>
  );
}
