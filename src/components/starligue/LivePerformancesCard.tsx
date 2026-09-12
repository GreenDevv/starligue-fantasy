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

function MatchLine({ entry }: { entry: LiveGameweekPerformanceEntry }) {
  const { match } = entry;
  const finished = match.status === "FINISHED";
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  return (
    <div className="flex items-center gap-1 text-[11px] text-text-muted">
      <span>vs</span>
      <ClubLogo club={match.opponentClub} size="xs" />
      <span className="truncate">{match.opponentClub.shortName}</span>
      {hasScore && (
        <span className={`tabular-nums ${finished ? "" : "text-points-neg"}`}>
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

      {leader && (
        <Link
          href={`/players/${leader.playerId}`}
          className="flex items-center gap-3 rounded-md p-1 transition-colors hover:bg-border/10"
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

      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-points-neg/15 pt-2">
          {rest.map((e, i) => (
            <Link
              key={e.playerId}
              href={`/players/${e.playerId}`}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-border/10"
            >
              <span className="w-3 shrink-0 text-center text-text-muted">{i + 2}</span>
              <PlayerAvatar player={e} size="xs" variant="photo" focus="head" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-text">
                  {e.firstName} {e.lastName}
                </p>
                <div className="flex items-center gap-1.5">
                  <ClubLogo club={e.club} size="xs" />
                  <HighlightChips entry={e} compact />
                </div>
              </div>
              <RatingBadge rating={e.lnhRating} />
              <span className="w-10 shrink-0 text-right tabular-nums text-text-muted">
                {e.points > 0 ? "+" : ""}
                {e.points}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
