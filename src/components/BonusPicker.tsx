"use client";

import { useTranslations } from "next-intl";
import { TripleCaptainIcon, BenchBoostIcon, InsuranceIcon, StatisticianIcon } from "@/components/ui/icons";
import type { BonusType } from "@/lib/scoring/engine";

export type { BonusType };

const BONUS_ICONS: Record<BonusType, typeof TripleCaptainIcon> = {
  TRIPLE_CAPTAIN: TripleCaptainIcon,
  BENCH_BOOST: BenchBoostIcon,
  INSURANCE: InsuranceIcon,
  STATISTICIAN: StatisticianIcon,
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
  const tLabels = useTranslations("labels");
  const t = useTranslations("team");
  const quotaReached = usedBonusTypes.length >= seasonBonusQuota;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {(Object.keys(BONUS_ICONS) as BonusType[]).map((type) => {
        const Icon = BONUS_ICONS[type];
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
            <Icon
              className={`h-5 w-5 ${isActive ? "text-accent-secondary" : "text-text-muted"}`}
              strokeWidth={isActive ? 2.1 : 1.8}
            />
            <span className="text-sm font-semibold text-text">{tLabels(`bonus.${type}`)}</span>
            <span className="text-[10px] text-text-muted">{t(`bonus.${type}.description`)}</span>
            <span
              className={[
                "text-[10px] uppercase tracking-widest",
                isActive ? "text-accent-secondary" : isUsed || isBlockedByQuota ? "text-text-muted" : "text-text-muted/70",
              ].join(" ")}
            >
              {isActive
                ? t("bonus.status.active")
                : isUsed
                  ? t("bonus.status.used")
                  : isBlockedByQuota
                    ? t("bonus.status.quotaReached")
                    : t("bonus.status.available")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
