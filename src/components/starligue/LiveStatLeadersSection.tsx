import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { LiveLeaderCategory } from "@/lib/stats/get-live-leaders";

// Pendant du StatLeadersSection (journée notée, post-match) mais pour les leaders
// EN DIRECT des matchs en cours — voir get-live-leaders.ts. Se cache tout seul (côté
// serveur) dès qu'aucun match n'est LIVE ; la home la rafraîchit avec le reste de la
// page via <LiveRefresher/> pendant un créneau de match.
export function LiveStatLeadersSection({ categories }: { categories: LiveLeaderCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="pixel-corners border border-points-neg/40 bg-points-neg/5 p-3">
      <p className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-points-neg">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-neg opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-points-neg" />
        </span>
        Leaders en direct
      </p>
      <div className="flex flex-col gap-3">
        {categories.map((cat) => (
          <div key={cat.key}>
            <p className="mb-1.5 text-xs font-semibold text-text">{cat.label}</p>
            <ol className="flex flex-col gap-1">
              {cat.leaders.map((e, i) => (
                <li key={e.playerId} className="flex items-center gap-2 text-xs">
                  <span className="w-3.5 shrink-0 text-center text-text-muted">{i + 1}</span>
                  <PlayerAvatar player={e} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-text">
                    {e.firstName} {e.lastName}
                  </span>
                  <ClubLogo club={e.club} size="xs" />
                  <span className="font-arcade text-sm tabular-nums text-points-neg">{e.value}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
