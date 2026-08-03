import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { ClubPageMatch } from "@/lib/clubs/club-page-data";

// Bilan V/N/D + forme (5 derniers matchs Starligue, pastilles) — extrait de
// /clubs/[id] (en-tête club) pour être réutilisé tel quel sur la page
// head-to-head (/clubs/[id]/vs/[opponentId], sous chaque logo), garantissant la
// même règle anti-spoiler simulation partout (voir club-page-data.ts). `rank`
// optionnel : affiché en gros/jaune sur la page club, omis sur la page H2H (déjà
// présent dans le tableau comparatif en dessous).
export async function ClubFormBadge({
  wins,
  draws,
  losses,
  lastFive,
  rank,
  className,
}: {
  wins: number;
  draws: number;
  losses: number;
  lastFive: (ClubPageMatch | null)[];
  rank?: number;
  className?: string;
}) {
  const tDash = await getTranslations("dashboard");
  const tClubs = await getTranslations("clubs");

  return (
    <div className={cn("flex flex-col items-center leading-none", className)}>
      {rank !== undefined && <span className="font-arcade text-4xl text-accent-secondary">{rank}</span>}
      <span
        className={cn(
          "uppercase tracking-wide text-text-muted",
          rank !== undefined ? "mt-0.5 text-[11px]" : "text-[11px]"
        )}
      >
        {wins}
        {tDash("clubStandingsWidget.col.wins")} · {draws}
        {tDash("clubStandingsWidget.col.draws")} · {losses}
        {tDash("clubStandingsWidget.col.losses")}
      </span>
      {/* Mêmes couleurs que la légende victoire/défaite/nul de ClubMatchesPanel.
          Pastille neutre (non remplie) pour un match qui n'a pas encore eu lieu
          (début de saison). */}
      <div className="mt-1.5 flex items-center gap-1" aria-label={tClubs("detail.recentForm")}>
        {lastFive.map((m, i) => {
          if (!m || m.ownScore === null || m.opponentScore === null) {
            return <span key={`empty-${i}`} className="h-2.5 w-2.5 rounded-full border border-border" />;
          }
          const outcome = m.ownScore > m.opponentScore ? "win" : m.ownScore < m.opponentScore ? "loss" : "draw";
          const tone =
            outcome === "win" ? "bg-points-pos" : outcome === "loss" ? "bg-points-neg" : "bg-accent-secondary";
          return (
            <span
              key={m.id}
              title={`${m.opponent.shortName} ${m.ownScore}-${m.opponentScore}`}
              className={`h-2.5 w-2.5 rounded-full ${tone}`}
            />
          );
        })}
      </div>
    </div>
  );
}
