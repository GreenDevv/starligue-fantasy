// Ajustement de la valeur marchande en cours de saison — fonction PURE, aucun
// import Prisma. À chaque journée, les joueurs sont classés par poste selon leur
// note LNH du match : les meilleurs du poste gagnent en valeur, les derniers en
// perdent. Ces valeurs n'ont d'effet concret que pendant les fenêtres de transfert
// (src/lib/transfers/window.ts) — le reste du temps l'effectif est verrouillé.

import type { Position } from "@/lib/squad/validation";

export interface ValueAdjustmentInput {
  playerId: string;
  position: Position;
  lnhRating: number;
}

export interface ValueAdjustmentConfig {
  step: number; // défaut 0.5
  topN: number; // défaut 5
  bottomN: number; // défaut 5
}

export const DEFAULT_VALUE_ADJUSTMENT_CONFIG: ValueAdjustmentConfig = {
  step: 0.5,
  topN: 5,
  bottomN: 5,
};

/**
 * Calcule le delta de valeur marchande de chaque joueur noté à cette journée,
 * classé par poste. Si un poste compte moins de topN + bottomN joueurs notés, les
 * deux groupes sont réduits symétriquement (floor(n/2) chacun) pour qu'un même
 * joueur ne soit jamais compté à la fois dans le haut et le bas du classement.
 */
export function computeGameweekValueDeltas(
  entries: ValueAdjustmentInput[],
  config: ValueAdjustmentConfig = DEFAULT_VALUE_ADJUSTMENT_CONFIG,
): Map<string, number> {
  const byPosition = new Map<Position, ValueAdjustmentInput[]>();
  for (const e of entries) {
    const list = byPosition.get(e.position) ?? [];
    list.push(e);
    byPosition.set(e.position, list);
  }

  const deltas = new Map<string, number>();

  for (const group of byPosition.values()) {
    const sorted = [...group].sort((a, b) => a.lnhRating - b.lnhRating);
    const n = sorted.length;

    const bottomCount = n < config.topN + config.bottomN ? Math.floor(n / 2) : config.bottomN;
    const topCount = n < config.topN + config.bottomN ? Math.floor(n / 2) : config.topN;

    for (let i = 0; i < bottomCount; i++) {
      deltas.set(sorted[i]!.playerId, -config.step);
    }
    for (let i = 0; i < topCount; i++) {
      deltas.set(sorted[n - 1 - i]!.playerId, config.step);
    }
  }

  return deltas;
}
