"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import { COMPUTED_STAT_LINES } from "@/lib/stats/computed-stat-lines";
import { StatLeaderCard } from "@/components/dashboard/StatLeaderCard";
import type { SeasonMode } from "@/lib/team/active-team-context";

// Lignes brutes (boxscore) + dérivées (points fantasy) dans la même checklist —
// même registre combiné que StatLeadersPanel.tsx (dashboard privé), mais UI
// différente ici : une checklist toujours visible (demande explicite) plutôt
// qu'un flux "ajouter une stat" à la volée. StatLeaderCard est réutilisé tel
// quel — déjà "safe" pour un visiteur non connecté (son appel à
// /api/my-team/ownership échoue silencieusement, voir le composant).
const ALL_LINES = [...STAT_LINES, ...COMPUTED_STAT_LINES];

const DEFAULT_VISIBLE_KEYS = ["goalsTotal", "assists", "ballsRecovered", "neutralizations"];

function storageKey(mode: SeasonMode): string {
  return `starligue:statsPage:${mode}`;
}

export function StatsExplorerView({ mode, seasonId }: { mode: SeasonMode; seasonId: string }) {
  const t = useTranslations("stats");
  const tLabels = useTranslations("labels");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE_KEYS);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(mode));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
        setVisibleKeys(parsed);
      }
    } catch {
      // localStorage corrompu — on garde les défauts
    }
  }, [mode]);

  function toggle(key: string, checked: boolean) {
    const next = checked ? [...visibleKeys, key] : visibleKeys.filter((k) => k !== key);
    setVisibleKeys(next);
    window.localStorage.setItem(storageKey(mode), JSON.stringify(next));
  }

  // Ordre d'affichage = ordre du registre (pas ordre de coche) pour que les
  // sections restent stables quel que soit l'ordre dans lequel les cases ont
  // été cochées.
  const visibleLines = ALL_LINES.filter((l) => visibleKeys.includes(l.key));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
      <div className="flex flex-col gap-3 lg:order-1">
        {visibleLines.length === 0 ? (
          <p className="pixel-corners border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
            {t("emptyState")}
          </p>
        ) : (
          visibleLines.map((line) => (
            <StatLeaderCard
              key={line.key}
              statKey={line.key}
              seasonId={seasonId}
              onRemove={() => toggle(line.key, false)}
              showRemove={false}
            />
          ))
        )}
      </div>

      <div className="pixel-corners flex flex-col gap-1 border border-border bg-surface p-3 lg:order-2 lg:sticky lg:top-20">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-text-muted">{t("checklistTitle")}</p>
        {ALL_LINES.map((line) => (
          <label
            key={line.key}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-text transition-colors hover:bg-border/20"
          >
            <input
              type="checkbox"
              checked={visibleKeys.includes(line.key)}
              onChange={(e) => toggle(line.key, e.target.checked)}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            <span className="truncate">{tLabels(`statLine.${line.key}`)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
