import { Link } from "@/i18n/navigation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { pickHighlightStats, type HighlightStatKey } from "@/lib/players/highlight-stat";
import type { LiveGameweekPerformances, LiveGameweekPerformanceEntry } from "@/lib/matches/current-gameweek-performances";

// Carte "meilleures perfs en direct" de la journée en cours — remplace l'ancienne
// liste toute simple embarquée dans la bande "journée en cours" de la home
// (demande explicite : plus stylée, plus détaillée). Même principe que
// StatLeaderCard (leader mis en avant, le reste en petit) pour rester cohérent
// avec le reste du site — voir ARCHITECTURE.md §32.
//
// v2 (13/09, retour direct "beaucoup trop d'espace perdu sur desktop") : les
// entrées 2-6 étaient une liste de lignes pleine largeur avec un grand vide
// entre le nom et la note — remplacées par une grille de mini-cartes (même
// rythme de colonnes que le strip de matchs "wide" juste au-dessus,
// grid-cols-2 sm:grid-cols-3 md:grid-cols-4, voir MatchesStrip.tsx), le
// leader occupant une cellule deux fois plus large plutôt qu'une ligne
// pleine largeur à part.
const HIGHLIGHT_LABEL: Record<HighlightStatKey, string> = {
  goals: "but",
  assists: "passe",
  saves: "arrêt",
};

function HighlightChips({ entry, compact = false }: { entry: LiveGameweekPerformanceEntry; compact?: boolean }) {
  const stats = pickHighlightStats(entry);
  if (stats.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {stats.map((s) => (
        <span
          key={s.key}
          className={`pixel-corners-sm bg-accent-secondary/10 font-semibold text-accent-secondary ${
            compact ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
          }`}
        >
          {s.value} {HIGHLIGHT_LABEL[s.key]}
          {s.value > 1 ? "s" : ""}
        </span>
      ))}
    </div>
  );
}

function MatchLine({ entry, compact = false }: { entry: LiveGameweekPerformanceEntry; compact?: boolean }) {
  const { match } = entry;
  const finished = match.status === "FINISHED";
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  return (
    <div className={`flex min-w-0 items-center gap-1 text-text-muted ${compact ? "text-[10px]" : "text-[11px]"}`}>
      <span className="shrink-0">vs</span>
      <ClubLogo club={match.opponentClub} size="xs" />
      <span className="truncate">{match.opponentClub.shortName}</span>
      {hasScore && (
        <span className={`shrink-0 tabular-nums ${finished ? "" : "text-points-neg"}`}>
          ({entry.match.isHome ? `${match.homeScore}-${match.awayScore}` : `${match.awayScore}-${match.homeScore}`})
        </span>
      )}
    </div>
  );
}

function RatingBadge({ rating, size = "base" }: { rating: number; size?: "base" | "lg" }) {
  const color = rating >= 7 ? "text-points-pos" : rating < 5 ? "text-points-neg" : "text-text";
  return (
    <span className={`font-arcade tabular-nums leading-none ${color} ${size === "lg" ? "text-3xl" : "text-base"}`}>
      {rating.toFixed(1)}
    </span>
  );
}

// Mini-carte d'une perf (2ᵉ à 6ᵉ) — autonome (bordée) plutôt qu'une ligne pleine
// largeur, pour bien se comporter dans une grille à plusieurs colonnes.
function PerformerCard({ entry, rank }: { entry: LiveGameweekPerformanceEntry; rank: number }) {
  return (
    <Link
      href={`/players/${entry.playerId}`}
      className="pixel-corners-sm flex flex-col gap-1.5 border border-points-neg/15 bg-bg/40 p-2 transition-colors hover:bg-border/10"
    >
      <div className="flex items-center gap-2">
        <span className="w-3 shrink-0 text-center text-[10px] text-text-muted">{rank}</span>
        <PlayerAvatar player={entry} size="xs" variant="photo" focus="head" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-text">
            {entry.firstName} {entry.lastName}
          </p>
          <MatchLine entry={entry} compact />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pl-5">
        <HighlightChips entry={entry} compact />
        <div className="flex shrink-0 items-center gap-1.5">
          <RatingBadge rating={entry.lnhRating} />
          <span className="text-[11px] font-semibold tabular-nums text-points-pos">
            {entry.points > 0 ? "+" : ""}
            {entry.points}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function LivePerformancesCard({ gameweekNumber, entries }: LiveGameweekPerformances) {
  if (entries.length === 0) return null;
  const [leader, ...rest] = entries;

  return (
    <div className="pixel-corners shadow-glow-red mt-3 border border-points-neg/40 bg-points-neg/[0.04] p-3">
      <p className="mb-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-points-neg">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-neg opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-points-neg" />
        </span>
        Meilleures perfs en direct · J{gameweekNumber}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {leader && (
          <Link
            href={`/players/${leader.playerId}`}
            className="pixel-corners-sm col-span-2 flex items-center gap-3 border border-points-neg/25 bg-points-neg/[0.06] p-2 transition-colors hover:bg-border/10"
          >
            <PlayerAvatar player={leader} size="lg" variant="photo" focus="head" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">
                {leader.firstName} {leader.lastName}
              </p>
              <MatchLine entry={leader} />
              <div className="mt-1">
                <HighlightChips entry={leader} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <RatingBadge rating={leader.lnhRating} size="lg" />
              <span className="text-xs font-semibold tabular-nums text-points-pos">
                {leader.points > 0 ? "+" : ""}
                {leader.points} pts
              </span>
            </div>
          </Link>
        )}

        {rest.map((e, i) => (
          <PerformerCard key={e.playerId} entry={e} rank={i + 2} />
        ))}
      </div>
    </div>
  );
}
