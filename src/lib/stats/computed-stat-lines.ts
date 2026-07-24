// Lignes de stats DÉRIVÉES (pas des colonnes brutes de PlayerMatchStat, donc pas
// éligibles au bonus/malus "leader de journée" — voir src/lib/scoring/stat-leaders.ts
// qui n'itère que sur STAT_LINES) — registre séparé pour ne pas polluer ce
// mécanisme avec une valeur déjà elle-même un calcul de points.
export interface ComputedStatLine {
  key: string;
  label: string;
}

export const COMPUTED_STAT_LINES: ComputedStatLine[] = [
  {
    key: "fantasyPoints",
    // Hypothèse fixe : le joueur aurait été titulaire (pas remplaçant) et pas
    // capitaine ce jour-là, quel qu'ait été son alignement réel — même formule
    // que la colonne "Pts (tit.)" de la fiche joueur (src/lib/scoring/engine.ts,
    // computePlayerPoints), bonus/malus "leader de journée" non inclus (même
    // convention que la fiche joueur, qui ne les recalcule pas non plus).
    label: "Points fantasy (titulaire)",
  },
];

export const COMPUTED_STAT_LINE_KEYS = COMPUTED_STAT_LINES.map((s) => s.key);

export function getComputedStatLine(key: string): ComputedStatLine | undefined {
  return COMPUTED_STAT_LINES.find((s) => s.key === key);
}
