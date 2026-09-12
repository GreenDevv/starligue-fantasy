import { getTranslations } from "next-intl/server";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { WeeklyLeadersResult } from "@/lib/stats/get-weekly-leaders";

export async function StatLeadersSection({ gameweekNumber, categories, hasLiveUpdates }: WeeklyLeadersResult) {
  const withLeaders = categories.filter((c) => c.leaders.length > 0);
  if (withLeaders.length === 0) return null;

  const t = await getTranslations("dashboard");

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-3 flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">
          {t("statLeadersSection.subtitle", { number: gameweekNumber ?? 0 })}
        </p>
        {hasLiveUpdates && (
          <span className="pixel-corners-sm bg-points-neg/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-points-neg shadow-glow-red">
            {t("statLeadersSection.live")}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {withLeaders.map((cat) => (
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
                  <span className="font-arcade text-sm tabular-nums text-accent">{e.value}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
