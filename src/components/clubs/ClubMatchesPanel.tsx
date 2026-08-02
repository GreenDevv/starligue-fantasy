"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { ClubMatchesCalendar } from "@/components/clubs/ClubMatchesCalendar";
import type { ClubPageMatch } from "@/lib/clubs/club-page-data";
import type { ClubWarmupMatch } from "@/lib/matches/get-warmup-matches";

type VenueFilter = "all" | "home" | "away";
export type CompetitionKind = "starligue" | "warmup" | "coupe" | "championsLeague" | "europeanLeague";

interface ClubHeaderInfo {
  id: string;
  shortName: string;
  name: string;
  logoUrl: string | null;
}

// Championnat, Warm Up, Coupe de France et EHF Champions League fusionnés dans une
// seule forme pour l'affichage/filtrage commun (demande explicite de l'utilisateur :
// "tout dans la même div", puis "exactement la même chose" répétée pour chaque
// nouvelle compétition ajoutée). Exportée :
// réutilisée telle quelle par ClubMatchesCalendar (résultats + à venir désormais
// unifiés dans un seul calendrier, demande explicite "mets les résultats aussi
// dans le calendrier"). `badge` est désormais toujours une nomenclature COURTE
// ("J{n}"/"MD{n}"/etc. localisé pour Starligue, "WU"/"CDF" sinon) puisqu'il est
// affiché en petit chip dans les deux vues (grille ET calendrier) — le nom complet
// de la compétition vit dans le tooltip et dans la légende (competitionCheckboxes).
export interface UnifiedMatch {
  kind: CompetitionKind;
  id: string;
  isHome: boolean;
  kickoffAt: Date;
  ownScore: number | null;
  opponentScore: number | null;
  opponent: { shortName: string; name: string; logoUrl: string | null };
  href: string | null; // null pour Warm Up/Coupe de France : l'adversaire n'a pas toujours de page /clubs/[id] (D2/étranger)
  tooltip: string;
  badge: string;
}

function outcome(m: UnifiedMatch): "win" | "loss" | "draw" | null {
  if (m.ownScore === null || m.opponentScore === null) return null;
  if (m.ownScore > m.opponentScore) return "win";
  if (m.ownScore < m.opponentScore) return "loss";
  return "draw";
}

// Bordure/fond teintés par résultat (victoire/défaite/nul) — palette existante
// (ARCHITECTURE.md §8.1), aucune couleur ajoutée : points.pos/neg déjà utilisées
// pour les points fantasy, accent-secondary déjà utilisée pour les alertes/valeurs.
// Un match sans résultat (à venir) garde la teinte accent neutre historique.
function outcomeToneClasses(m: UnifiedMatch): string {
  switch (outcome(m)) {
    case "win":
      return "border-points-pos/60 bg-points-pos/10";
    case "loss":
      return "border-points-neg/60 bg-points-neg/10";
    case "draw":
      return "border-accent-secondary/60 bg-accent-secondary/10";
    default:
      return "border-accent/50 bg-accent/5";
  }
}

function scoreTextClasses(m: UnifiedMatch): string {
  switch (outcome(m)) {
    case "win":
      return "text-points-pos";
    case "loss":
      return "text-points-neg";
    case "draw":
      return "text-accent-secondary";
    default:
      return "text-text-muted";
  }
}

// Grille logo+logo avec date au-dessus, badge compétition en coin — même gabarit
// pour "Derniers résultats" ET "Prochains matchs" (demande explicite : "uniformise
// les résultats, même affichage que les matchs à venir"). `showScore` bascule
// l'affichage du score + la teinte de résultat ; un match sans score (à venir, ou
// pas encore joué) reste neutre même si showScore est vrai.
function MatchBox({ club, match, showScore }: { club: ClubHeaderInfo; match: UnifiedMatch; showScore: boolean }) {
  const format = useFormatter();
  const homeClub = match.isHome ? club : match.opponent;
  const awayClub = match.isHome ? match.opponent : club;
  const decided = showScore && match.ownScore !== null && match.opponentScore !== null;
  const homeScore = match.isHome ? match.ownScore : match.opponentScore;
  const awayScore = match.isHome ? match.opponentScore : match.ownScore;

  const content = (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase leading-none tracking-wide text-text-muted">
        {format.dateTime(match.kickoffAt, { day: "2-digit", month: "short" })}{" "}
        {format.dateTime(match.kickoffAt, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <div className="flex items-center justify-center gap-0.5">
        <ClubLogo club={homeClub} size="lg" title={match.isHome ? undefined : match.tooltip} largeOnDesktop />
        {decided && (
          <span className={`font-arcade text-sm tracking-wide ${scoreTextClasses(match)}`}>
            {homeScore}-{awayScore}
          </span>
        )}
        <ClubLogo club={awayClub} size="lg" title={match.isHome ? match.tooltip : undefined} largeOnDesktop />
      </div>
    </div>
  );

  const boxClassName = `relative flex items-center justify-center gap-0.5 rounded-md border transition-colors hover:border-accent/50 px-1.5 py-1.5 ${
    decided ? outcomeToneClasses(match) : "border-border/60 bg-bg"
  }`;
  const badge = (
    <span
      title={match.tooltip}
      className="absolute -left-1.5 -top-1.5 rounded-sm border border-border bg-surface px-1 text-[8px] font-semibold uppercase leading-[14px] tracking-wide text-text-muted"
    >
      {match.badge}
    </span>
  );

  return match.href ? (
    <Link key={`${match.kind}-${match.id}`} href={match.href} className={boxClassName}>
      {badge}
      {content}
    </Link>
  ) : (
    <div key={`${match.kind}-${match.id}`} className={boxClassName}>
      {badge}
      {content}
    </div>
  );
}

function MatchesGrid({ club, matches, showScore }: { club: ClubHeaderInfo; matches: UnifiedMatch[]; showScore: boolean }) {
  return (
    <div className="pixel-corners border border-border bg-surface px-3 py-2.5">
      <div className="grid grid-cols-2 gap-2">
        {matches.map((m) => (
          <MatchBox key={`${m.kind}-${m.id}`} club={club} match={m} showScore={showScore} />
        ))}
      </div>
    </div>
  );
}

// Légende des codes couleur (résultat) et de la nomenclature (compétition) —
// demande explicite de l'utilisateur, affichée une seule fois au-dessus des
// résultats/prochains matchs/calendrier puisque les trois vues partagent le même
// code visuel.
function MatchesLegend() {
  const t = useTranslations("matches");

  const swatches: { tone: string; label: string }[] = [
    { tone: "border-points-pos/60 bg-points-pos/10", label: t("panel.legendWin") },
    { tone: "border-points-neg/60 bg-points-neg/10", label: t("panel.legendLoss") },
    { tone: "border-accent-secondary/60 bg-accent-secondary/10", label: t("panel.legendDraw") },
    { tone: "border-accent/50 bg-accent/5", label: t("panel.legendUpcoming") },
  ];
  const badges: { code: string; label: string }[] = [
    { code: t("list.gameweekShort", { number: "#" }), label: t("panel.competitionStarligue") },
    { code: t("panel.competitionShortWarmup"), label: t("panel.competitionWarmup") },
    { code: t("panel.competitionShortCoupe"), label: t("panel.competitionCoupeDeFrance") },
    { code: t("panel.competitionShortChampionsLeague"), label: t("panel.competitionChampionsLeague") },
    { code: t("panel.competitionShortEuropeanLeague"), label: t("panel.competitionEuropeanLeague") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pixel-corners border border-border bg-surface px-3 py-2 text-[10px] text-text-muted">
      <span className="font-semibold uppercase tracking-wide text-text-muted/80">{t("panel.legendTitle")}</span>
      {swatches.map((s) => (
        <span key={s.label} className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm border ${s.tone}`} />
          {s.label}
        </span>
      ))}
      <span className="text-border">|</span>
      {badges.map((b) => (
        <span key={b.label} className="flex items-center gap-1">
          <span className="rounded-sm border border-border bg-bg px-1 text-[8px] font-semibold uppercase tracking-wide">{b.code}</span>
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function ClubMatchesPanel({
  club,
  results,
  upcoming,
  warmupMatches,
  coupeDeFranceMatches,
  championsLeagueMatches,
  europeanLeagueMatches,
  rankByClubId,
}: {
  club: ClubHeaderInfo;
  results: ClubPageMatch[];
  upcoming: ClubPageMatch[];
  warmupMatches: ClubWarmupMatch[];
  coupeDeFranceMatches: ClubWarmupMatch[];
  championsLeagueMatches: ClubWarmupMatch[];
  europeanLeagueMatches: ClubWarmupMatch[];
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
    championsLeague: true,
    europeanLeague: true,
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
      badge: t("list.gameweekShort", { number: m.gameweekNumber }),
    };
  };

  const toUnifiedFriendly =
    (kind: "warmup" | "coupe" | "championsLeague" | "europeanLeague", shortBadge: string, competitionLabel: string) =>
    (m: ClubWarmupMatch): UnifiedMatch => ({
      kind,
      id: m.id,
      isHome: m.isHome,
      kickoffAt: m.kickoffAt,
      ownScore: m.ownScore,
      opponentScore: m.opponentScore,
      opponent: m.opponent,
      href: null,
      tooltip: `${competitionLabel}\n${m.opponent.division ? `${m.opponent.name} (${m.opponent.division})` : m.opponent.name}`,
      badge: shortBadge,
    });

  const toUnifiedWarmup = toUnifiedFriendly("warmup", t("panel.competitionShortWarmup"), t("panel.competitionWarmup"));
  const toUnifiedCoupe = toUnifiedFriendly("coupe", t("panel.competitionShortCoupe"), t("panel.competitionCoupeDeFrance"));
  const toUnifiedChampionsLeague = toUnifiedFriendly(
    "championsLeague",
    t("panel.competitionShortChampionsLeague"),
    t("panel.competitionChampionsLeague")
  );
  const toUnifiedEuropeanLeague = toUnifiedFriendly(
    "europeanLeague",
    t("panel.competitionShortEuropeanLeague"),
    t("panel.competitionEuropeanLeague")
  );

  const isFriendlyDecided = (m: ClubWarmupMatch) => m.ownScore !== null && m.opponentScore !== null;

  const allResults = useMemo(
    () =>
      [
        ...results.map(toUnifiedStarligue),
        ...warmupMatches.filter(isFriendlyDecided).map(toUnifiedWarmup),
        ...coupeDeFranceMatches.filter(isFriendlyDecided).map(toUnifiedCoupe),
        ...championsLeagueMatches.filter(isFriendlyDecided).map(toUnifiedChampionsLeague),
        ...europeanLeagueMatches.filter(isFriendlyDecided).map(toUnifiedEuropeanLeague),
      ].sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, warmupMatches, coupeDeFranceMatches, championsLeagueMatches, europeanLeagueMatches, club.id, rankByClubId]
  );

  const allUpcoming = useMemo(
    () =>
      [
        ...upcoming.map(toUnifiedStarligue),
        ...warmupMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedWarmup),
        ...coupeDeFranceMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedCoupe),
        ...championsLeagueMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedChampionsLeague),
        ...europeanLeagueMatches.filter((m) => !isFriendlyDecided(m)).map(toUnifiedEuropeanLeague),
      ].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcoming, warmupMatches, coupeDeFranceMatches, championsLeagueMatches, europeanLeagueMatches, club.id, rankByClubId]
  );

  const matchesFilter = (m: UnifiedMatch) => {
    if (!visibleKinds[m.kind]) return false;
    if (venue === "home" && !m.isHome) return false;
    if (venue === "away" && m.isHome) return false;
    return true;
  };

  const filteredResults = allResults.filter(matchesFilter);
  const filteredUpcoming = allUpcoming.filter(matchesFilter);
  const filteredAll = useMemo(() => [...filteredResults, ...filteredUpcoming], [filteredResults, filteredUpcoming]);

  const competitionCheckboxes: { kind: CompetitionKind; label: string }[] = [
    { kind: "starligue", label: t("panel.competitionStarligue") },
    { kind: "warmup", label: t("panel.competitionWarmup") },
    { kind: "coupe", label: t("panel.competitionCoupeDeFrance") },
    { kind: "championsLeague", label: t("panel.competitionChampionsLeague") },
    { kind: "europeanLeague", label: t("panel.competitionEuropeanLeague") },
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

      <MatchesLegend />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.recentResults")}</p>
        {filteredResults.length === 0 ? (
          <div className="overflow-hidden pixel-corners border border-border bg-surface">
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noResults")}</p>
          </div>
        ) : (
          <MatchesGrid club={club} matches={filteredResults} showScore />
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.upcoming")}</p>
        {filteredUpcoming.length === 0 ? (
          <div className="overflow-hidden pixel-corners border border-border bg-surface">
            <p className="px-3 py-6 text-center text-xs text-text-muted">{t("panel.noUpcoming")}</p>
          </div>
        ) : (
          <MatchesGrid club={club} matches={filteredUpcoming} showScore={false} />
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("panel.calendarTitle")}</p>
        <ClubMatchesCalendar matches={filteredAll} />
      </div>
    </div>
  );
}
