"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import { COMPUTED_STAT_LINES } from "@/lib/stats/computed-stat-lines";
import { StatLeaderCard } from "./StatLeaderCard";

// Lignes brutes (boxscore) + dérivées (points fantasy) dans le même sélecteur —
// l'utilisateur ne distingue pas les deux, seule stat-leaders.ts (bonus/malus de
// journée) a besoin de la distinction en interne.
const ALL_LINES = [...STAT_LINES, ...COMPUTED_STAT_LINES];

// Panneau de leaders — cartes empilées, une par ligne de stat activée par
// l'utilisateur (persisté en localStorage, pas de modèle DB pour une préférence
// purement UI). Décision actée avec l'utilisateur : sélecteur compact par ligne,
// leader n°1 en photo plus grosse, toggle Journée/Saison/Match indépendant par carte
// (StatLeaderCard, réutilisé tel quel par le dashboard personnalisable).
const DEFAULT_VISIBLE_KEYS = ["goalsTotal", "assists", "ballsRecovered", "neutralizations"];

function storageKey(context: "live" | "simulation"): string {
  return `starligue:statLeaders:${context}`;
}

export function StatLeadersPanel({
  seasonId,
  context,
}: {
  seasonId: string;
  context: "live" | "simulation";
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tLabels = useTranslations("labels");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE_KEYS);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(context));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string") && parsed.length > 0) {
        setVisibleKeys(parsed);
      }
    } catch {
      // localStorage corrompu — on garde les défauts
    }
  }, [context]);

  function persist(keys: string[]) {
    setVisibleKeys(keys);
    window.localStorage.setItem(storageKey(context), JSON.stringify(keys));
  }

  const hiddenLines = ALL_LINES.filter((l) => !visibleKeys.includes(l.key));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("statLeadersPanel.title")}</p>

      {visibleKeys.map((key) => (
        <StatLeaderCard
          key={key}
          statKey={key}
          seasonId={seasonId}
          onRemove={() => persist(visibleKeys.filter((k) => k !== key))}
        />
      ))}

      {showPicker ? (
        <div className="pixel-corners border border-border bg-surface p-3">
          <p className="mb-2 text-xs text-text-muted">{t("statLeadersPanel.addStatLabel")}</p>
          {hiddenLines.length === 0 ? (
            <p className="text-xs text-text-muted">{t("statLeadersPanel.allLinesVisible")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {hiddenLines.map((line) => (
                <button
                  key={line.key}
                  onClick={() => {
                    persist([...visibleKeys, line.key]);
                    setShowPicker(false);
                  }}
                  className="pixel-corners-sm border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:text-text"
                >
                  {tLabels(`statLine.${line.key}`)}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowPicker(false)}
            className="mt-2 text-xs text-text-muted transition-colors hover:text-text"
          >
            {tCommon("close")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="pixel-corners-sm border border-dashed border-border py-2 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
        >
          {t("statLeadersPanel.addStatCta")}
        </button>
      )}
    </div>
  );
}
