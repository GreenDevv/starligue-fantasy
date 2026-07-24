import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { PerformancesCardData } from "@/lib/news/get-weekly-cards";

export function StarliguePerformancesCard({ gameweekNumber, entries }: PerformancesCardData) {
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">
        Meilleures performances · journée {gameweekNumber}
      </p>
      <ol className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li key={e.playerId} className="flex items-center gap-2 text-sm">
            <span className="w-4 shrink-0 text-center font-arcade text-text-muted">{i + 1}</span>
            <PlayerAvatar player={e} size="sm" />
            <span className="min-w-0 flex-1 truncate text-text">
              {e.firstName} {e.lastName}
            </span>
            <ClubLogo club={e.club} size="xs" />
            {e.lnhRating !== null && (
              <span className="text-xs text-text-muted">{e.lnhRating.toFixed(1)}</span>
            )}
            <span className="font-arcade text-sm tabular-nums text-points-pos">
              {e.points > 0 ? "+" : ""}
              {e.points}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
