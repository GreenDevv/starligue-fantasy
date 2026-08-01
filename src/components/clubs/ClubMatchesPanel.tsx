"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { ClubMatchesCalendar } from "@/components/clubs/ClubMatchesCalendar";
import type { ClubPageMatch } from "@/lib/clubs/club-page-data";
import type { ClubWarmupMatch } from "@/lib/matches/get-warmup-matches";

type VenueFilter = "all" | "home" | "away";
type CompetitionKind = "starligue" | "warmup" | "coupe";

interface ClubHeaderInfo {
  id: string;
  shortName: string;
  name: string;
  logoUrl: string | null;
}

// Championnat, Warm Up et Coupe de France fusionnés dans une seule forme pour
// l'affichage/filtrage commun (demande explicite de l'utilisateur : "tout dans la
// même div", puis "exactement la même chose pour la Coupe de France"). Le tooltip et
// le badge sont précalculés au moment de la fusion (contenu différent par
// compétition — journée+adversaire+classement pour Starligue, nom+division pour
// Warm Up/Coupe de France, cf. ARCHITECTURE.md §19) plutôt que recalculés dans
// MatchRow, pour ne garder qu'une seule fonction de rendu commune aux trois types.
interface UnifiedMatch {
  kind: CompetitionKind;
  id: string;
  isHome: boolean;
  kickoffAt: Date;
  ownScore: number | null;
  opponentScore: number | null;
  opponent: { shortName: string; name: string; logoUrl: string | null };
  href: string | null; // null pour Warm Up/Coupe de France : l'adversaire n'a pas toujours de page /clubs/[id] (D2/étranger)
  tooltip: string;
  badge: string; // "J{n}" pour Starligue, nom de la compétition sinon
}

function MatchRow({ match, showScore }: { match: UnifiedMatch; showScore: boolean }) {
  const tLabels = useTranslations("labels");
  const format = useFormatter();
  const formatDate = (date: Date) => format.dateTime(date, { day: "2-digit", month: "short" });

  const decided = match.ownScore !== null && match.opponentScore !== null;
  const outcome =
    decided && showScore
      ? match.ownScore! > match.opponentScore!
        ? "win"
        : match.ownScore! < match.opponentScore!
          ? "loss"
          : "draw"
      : null;

  const content = (
    <>
      <span className="w-9 shrink-0 text-center text-[10px] text-text-muted tabular-nums">{match.badge}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ClubLogo club={match.opponent} size="md" title={match.tooltip} largeOnDesktop />
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
    </>
  );

  const className = "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20";
  return match.href ? (
    <Link href={match.href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// Grille logo+logo avec date au-dessus — même gabarit que la toute première
// version du bloc Warm Up sur cette page (MatchesStrip avec showDate). Pas une
// simple réutilisation de MatchesStrip ici : le lien (page /vs/ pour un match
// Starligue, aucun lien pour un adversaire Warm Up/Coupe de France hors DB) et le
// tooltip sont désormais par-match plutôt que par-liste — MatchesStrip ne le permet
// pas (disableLink est global à la liste).
function UpcomingGrid({ club, matches }: { club: ClubHeaderInfo; matches: UnifiedMatch[] }) {
  const format = useFormatter();

  return (
    <div className="pixel-corners border border-border bg-surface px-3 py-2.5">
      <div className="grid grid-cols-2 gap-2">
        {matches.map((m) => {
          const homeClub = m.isHome ? club : m.opponent;
          const awayClub = m.isHome ? m.opponent : club;
          const content = (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] uppercase leading-none tracking-wide text-text-muted">
                {format.dateTime(m.kickoffAt, { day: "2-digit", month: "short" })}{" "}
                {format.dateTime(m.kickoffAt, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="flex items-center justify-center gap-0.5">
                <ClubLogo club={homeClub} size="lg" title={m.isHome ? undefined : m.tooltip} largeOnDesktop />
                <ClubLogo club={awayClub} size="lg" title={m.isHome ? m.tooltip : undefined} largeOnDesktop />
              </div>
            </div>
          );
          const boxClassName =
            "flex items-center justify-center gap-0.5 rounded-md border border-border/60 bg-bg transition-colors hover:border-accent/50 px-1.5 py-1.5";

          return m.href ? (
            <Link key={`${m.kind}-${m.id}`} href={m.href} className={boxClassName}>
              {content}
            </Link>
          ) : (
            <div key={`${m.kind}-${m.id}`} className={boxClassName}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClubMatchesPanel({
  club,
  results,
  upcoming,
  warmupMatches,
  coupeDeFranceMatches,
  rankByClubId,
}: {
  club: ClubHeaderInfo;
  results: ClubPageMatch[];
  upcoming: ClubPageMatch[];
  warmupMatches: ClubWarmupMatch[];
  coupeDeFranceMatches: ClubWarmupMatch[];
  rankByClubId: Record<string, number>;
}) {
  const t = useTranslations("matches");
  const tClubs = useTranslations("clubs");
  const tLabels = useTranslations("labels");
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [visibleKinds, setVisibleKinds] = useState<Record<CompetitionKind, boolean>>({
    starligue: true,
    warmup: true,
    coupe: true,
  });

  const toUnifiedStarligue = (m: ClubPageMatch): UnifiedMatch => {
    const rank = rankByClubId[m.opponent.id];
    const rankLine = rank !== undefined ? t("panel.tooltipRank", { rank }) : tClubs("compare.standingsUnavailable");
    return {
      kind: "starligue",
      id: m.id,
      isHome: m.isHome,
      kickoffAt: m.kickoffAt,
      ownScore: m.ownScore,
      opponentScore: m.opponentScore,
      opponent: m.opponent,
      href: `/clubs/${club.id}/vs/${m.opponent.id}`,
      tooltip: `${t("list.gameweek", { number: m.gameweekNumber })}\n${m.opponent.name}\n${rankLine}`,
      badge: `J${m.gameweekNumber}`,
    };
  };

  const toUnifiedFriendly =
    (kind: "warmup" | "coupe", badge: string) =>
    (m: ClubWarmupMatch): UnifiedMatch => ({
      kind,
      id: m.id,
      isHome: m.isHome,
      kickoffAt: m.kickoffAt,
      ownScore: m.ownScore,
      opponentScore: m.opponentScore,
      opponent: m.opponent,
      href: null,
      tooltip: m.opponent.division ? `${m.opponent.name} (${m.opponent.division})` : m.opponent.name,
      badge,
    });

  const toUnifiedWarmup = toUnifiedFriendly("warmup", t("panel.competitionWarmup"));
  const toUnifiedCoupe = toUnifiedFriendly("coupe", t("panel.competitionCoupeDeFrance"));

  const isFriendlyDecided = (m: ClubWarmupMatch) => m.ownScore !== null && m.opponentScore !== null;

  const allResults = useMemo(
    () =>
      [
        ...results.map(toUnifiedStarligue),
        ...warmupMatches.filter(isFriendlyDecided).map(toUnifiedWarmup),
        ...coupeDeFranceMatches.filter(isFriendlyDecided).map(toUnifiedCoupe),
      ].sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, warmupMatches, coupeDeFranceMatches, club.id, rankByClubId]
  );

  const allUpcoming = useMemo(
    () =>
      [
        ...upcoming.map(toUnifiedStarligue),
        ...warmupMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedWarmup),
        ...coupeDeFranceMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedCoupe),
      ].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcoming, warmupMatches, coupeDeFranceMatches, club.id, rankByClubId]
  );

  const matchesFilter = (m: UnifiedMatch) => {
    if (!visibleKinds[m.kind]) return false;
    if (venue === "home" && !m.isHome) return false;
    if (venue === "away" && m.isHome) return false;
    return true;
  };

  const filteredResults = allResults.filter(matchesFilter);
  const filteredUpcoming = allUpcoming.filter(matchesFilter);

  const competitionCheckboxes: { kind: CompetitionKind; label: string }[] = [
    { kind: "starligue", label: t("panel.competitionStarligue") },
    { kind: "warmup", label: t("panel.competitionWarmup") },
    { kind: "coupe", label: t("panel.competitionCoupeDeFrance") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-3 text-xs text-text-muted">
          {competitionCheckboxes.map(({ kind, label }) => (
            <label key={kind} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={visibleKinds[kind]}
                onChange={(e) => setVisibleKinds((prev) => ({ ...prev, [kind]: e.target.checked }))}
                className="h-3.5 w-3.5 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.recentResults")}</p>
        <div className="overflow-hidden pixel-corners border border-border bg-surface">
          {filteredResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noResults")}</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredResults.map((m) => (
                <MatchRow key={`${m.kind}-${m.id}`} match={m} showScore />
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.upcoming")}</p>
        {filteredUpcoming.length === 0 ? (
          <div className="overflow-hidden pixel-corners border border-border bg-surface">
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noUpcoming")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <UpcomingGrid club={club} matches={filteredUpcoming} />
            <ClubMatchesCalendar matches={filteredUpcoming} />
          </div>
        )}
      </div>
    </div>
  );
}
