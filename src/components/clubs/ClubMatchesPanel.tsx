"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { ClubPageMatch } from "@/lib/clubs/club-page-data";

type VenueFilter = "all" | "home" | "away";

function MatchRow({ clubId, match, showScore }: { clubId: string; match: ClubPageMatch; showScore: boolean }) {
  const tLabels = useTranslations("labels");
  const format = useFormatter();
  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return format.dateTime(d, { day: "2-digit", month: "short" });
  };

  const decided = match.ownScore !== null && match.opponentScore !== null;
  const outcome =
    decided && showScore
      ? match.ownScore! > match.opponentScore!
        ? "win"
        : match.ownScore! < match.opponentScore!
          ? "loss"
          : "draw"
      : null;

  return (
    <Link
      href={`/clubs/${clubId}/vs/${match.opponent.id}`}
      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20"
    >
      <span className="w-7 shrink-0 text-center text-[10px] text-text-muted tabular-nums">J{match.gameweekNumber}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ClubLogo club={match.opponent} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-text">{match.opponent.name}</span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted">
            {match.isHome ? tLabels("venueFilter.home") : tLabels("venueFilter.away")} · {formatDate(match.kickoffAt)}
          </span>
        </div>
      </div>
      {showScore && decided ? (
        <span
          className={`shrink-0 font-arcade text-lg tracking-wide ${
            outcome === "win" ? "text-points-pos" : outcome === "loss" ? "text-points-neg" : "text-text-muted"
          }`}
        >
          {match.ownScore}-{match.opponentScore}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-text-muted">—</span>
      )}
    </Link>
  );
}

export function ClubMatchesPanel({ clubId, results, upcoming }: { clubId: string; results: ClubPageMatch[]; upcoming: ClubPageMatch[] }) {
  const t = useTranslations("matches");
  const tLabels = useTranslations("labels");
  const [venue, setVenue] = useState<VenueFilter>("all");

  const matchesFilter = (m: ClubPageMatch) => venue === "all" || (venue === "home" ? m.isHome : !m.isHome);
  const filteredResults = results.filter(matchesFilter);
  const filteredUpcoming = upcoming.filter(matchesFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="pixel-corners-sm flex w-fit items-center border border-border bg-surface p-0.5 text-xs">
        {(["all", "home", "away"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVenue(v)}
            aria-pressed={venue === v}
            className={`rounded-[3px] px-3 py-1.5 font-semibold uppercase tracking-wide transition-colors ${
              venue === v ? "bg-accent text-bg shadow-glow-accent" : "text-text-muted hover:text-text"
            }`}
          >
            {tLabels(`venueFilter.${v}`)}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.recentResults")}</p>
        <div className="overflow-hidden pixel-corners border border-border bg-surface">
          {filteredResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noResults")}</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredResults.map((m) => (
                <MatchRow key={m.id} clubId={clubId} match={m} showScore />
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.upcoming")}</p>
        <div className="overflow-hidden pixel-corners border border-border bg-surface">
          {filteredUpcoming.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noUpcoming")}</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredUpcoming.map((m) => (
                <MatchRow key={m.id} clubId={clubId} match={m} showScore={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
