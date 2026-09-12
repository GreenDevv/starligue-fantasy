import type { MatchOutcome } from "@/lib/matches/match-outcome";

// Pastille V/N/D pleine (fond + texte) — extrait de LivePerformancesCard.tsx pour
// être réutilisé par RankingTable ("forme" des 5 derniers matchs, ARCHITECTURE.md
// §34). Même convention de couleur que les colonnes du classement
// (ClubStandingsWidget).
const OUTCOME_STYLE: Record<MatchOutcome, string> = {
  V: "bg-points-pos text-bg",
  N: "bg-text-muted text-bg",
  D: "bg-points-neg text-bg",
};

export function OutcomeBadge({ outcome, big = false }: { outcome: MatchOutcome; big?: boolean }) {
  return (
    <span
      className={`pixel-corners-sm shrink-0 text-center font-bold leading-none ${OUTCOME_STYLE[outcome]} ${
        big ? "px-1.5 py-0.5 text-xs" : "px-1 py-0.5 text-[10px]"
      }`}
    >
      {outcome}
    </span>
  );
}
