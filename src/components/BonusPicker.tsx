"use client";

import { TripleCaptainIcon, BenchBoostIcon, InsuranceIcon, StatisticianIcon } from "@/components/ui/icons";
import { BONUS_LABELS } from "@/lib/scoring/bonus-labels";
import type { BonusType } from "@/lib/scoring/engine";

export type { BonusType };

const BONUS_INFO: Record<BonusType, { description: string; Icon: typeof TripleCaptainIcon }> = {
  TRIPLE_CAPTAIN: { description: "×3 sur le capitaine cette journée", Icon: TripleCaptainIcon },
  BENCH_BOOST: { description: "Les remplaçants comptent en ×1 cette journée", Icon: BenchBoostIcon },
  INSURANCE: { description: "Aucun joueur ne finit en négatif cette journée", Icon: InsuranceIcon },
  STATISTICIAN: { description: "×2 sur le bonus/malus leader de journée", Icon: StatisticianIcon },
};

interface BonusPickerProps {
  pendingBonus: BonusType | null;
  usedBonusTypes: BonusType[];
  seasonBonusQuota?: number;
  onSelect: (type: BonusType | null) => void;
  disabled?: boolean;
}

// Sélecteur de bonus de saison — composant partagé jeu en direct / simulation,
// même convention que CaptainPicker. Cliquer sur le bonus actif le désarme.
export function BonusPicker({
  pendingBonus,
  usedBonusTypes,
  seasonBonusQuota = 3,
  onSelect,
  disabled = false,
}: BonusPickerProps) {
  const quotaReached = usedBonusTypes.length >= seasonBonusQuota;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {(Object.keys(BONUS_INFO) as BonusType[]).map((type) => {
        const info = BONUS_INFO[type];
        const isUsed = usedBonusTypes.includes(type);
        const isActive = pendingBonus === type;
        // Un type jamais utilisé ne peut plus être choisi une fois le quota
        // global atteint (mais on peut toujours désarmer l'actif, via isActive).
        const isBlockedByQuota = !isUsed && !isActive && quotaReached;
        const isDisabled = disabled || (isUsed && !isActive) || isBlockedByQuota;
        return (
          <button
            key={type}
            type="button"
            onClick={() => !isDisabled && onSelect(isActive ? null : type)}
            disabled={isDisabled}
            className={[
              "pixel-corners-sm flex flex-col items-start gap-0.5 border px-3 py-2 text-left transition-colors",
              isActive
                ? "border-accent-secondary bg-accent-secondary/10 shadow-glow-amber"
                : "border-border bg-surface hover:border-accent-secondary/40",
              isDisabled ? "cursor-not-allowed opacity-50" : "active:bg-border/20",
            ].join(" ")}
          >
            <info.Icon
              className={`h-5 w-5 ${isActive ? "text-accent-secondary" : "text-text-muted"}`}
              strokeWidth={isActive ? 2.1 : 1.8}
            />
            <span className="text-sm font-semibold text-text">{BONUS_LABELS[type]}</span>
            <span className="text-[10px] text-text-muted">{info.description}</span>
            <span
              className={[
                "text-[10px] uppercase tracking-widest",
                isActive ? "text-accent-secondary" : isUsed || isBlockedByQuota ? "text-text-muted" : "text-text-muted/70",
              ].join(" ")}
            >
              {isActive
                ? "Actif cette journée"
                : isUsed
                  ? "Déjà utilisé"
                  : isBlockedByQuota
                    ? "Quota atteint"
                    : "Disponible"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
