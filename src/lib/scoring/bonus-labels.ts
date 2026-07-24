// Libellés FR des bonus de saison — partagé entre BonusPicker (UI de sélection) et
// les pages d'historique (affichage read-only du bonus snapshoté sur un lineup).
import type { BonusType } from "./engine";

export const BONUS_LABELS: Record<BonusType, string> = {
  TRIPLE_CAPTAIN: "Triple Capitaine",
  BENCH_BOOST: "Bench Boost",
  INSURANCE: "Assurance",
  STATISTICIAN: "Statisticien",
};
