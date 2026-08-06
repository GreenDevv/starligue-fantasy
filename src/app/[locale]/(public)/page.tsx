import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClubStandings } from "@/lib/standings/get";
import { getDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { getNewsFeed } from "@/lib/news/get-feed";
import { getTeamOfWeekCard, getPerformancesCard } from "@/lib/news/get-weekly-cards";
import { getWeeklyStatLeaders } from "@/lib/stats/get-weekly-leaders";
import {
  getWarmupMatches,
  getCoupeDeFranceMatches,
  getChampionsLeagueMatches,
  getEuropeanLeagueMatches,
} from "@/lib/matches/get-warmup-matches";
import { getTodayMatches } from "@/lib/matches/get-today-matches";
import { ehfCompetitionSlug } from "@/lib/matches/ehf-competition-slugs";
import { getActiveClubs } from "@/lib/clubs/get-active-clubs";
import { MatchesStrip } from "@/components/dashboard/MatchesStrip";
import { TodayMatchCarousel } from "@/components/dashboard/TodayMatchCarousel";
import { ClubLogoLink } from "@/components/starligue/ClubLogoLink";
import { StandingsSection } from "@/components/starligue/StandingsSection";
import { NewsFeed } from "@/components/starligue/NewsFeed";
import { StarligueBestXICard } from "@/components/starligue/StarligueBestXICard";
import { StarliguePerformancesCard } from "@/components/starligue/StarliguePerformancesCard";
import { StatLeadersSection } from "@/components/starligue/StatLeadersSection";
import { ComingSoon } from "@/components/ComingSoon";
import { IntroSplash } from "@/components/intro/IntroSplash";
import type { NewsCategory } from "@prisma/client";
import type { Metadata } from "next";

const VALID_CATEGORIES: NewsCategory[] = ["TRANSFER", "INJURY", "TEAM_OF_WEEK", "PERFORMANCE", "GENERAL"];

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  if (process.env.COMING_SOON === "true") {
    const t = await getTranslations({ locale: params.locale, namespace: "dashboard" });
    return {
      title: t("home.metadataTitle"),
      description: t("home.metadataDescription"),
    };
  }
  return {};
}

// Page d'accueil du site — vue d'ensemble de la Daikin StarLigue en un coup d'œil
// (résultats, prochains matchs, classement, actus scrapées lnh.fr + clubs, équipe
// type et meilleures perfs de la semaine, leaders stats) + porte d'entrée vers le
// jeu Fantasy Starligue (message de bienvenue). Mode Starligue (public) — hors
// PROTECTED_PREFIXES (src/lib/auth.ts), accessible sans compte, pas de
// redirection non plus pour un utilisateur déjà connecté. Header/nav communs
// (LocaleSwitcher, bouton "Fantasy" qui sert aussi de connexion) fournis par
// (public)/layout.tsx, pas par cette page. Anciennement /starligue, devenu la
// home sur demande explicite ; /starligue redirige ici désormais
// (src/app/[locale]/(public)/starligue/page.tsx), /starligue/[id] (détail
// d'une actu) reste à son emplacement d'origine.
export default async function HomePage({
  searchParams,
}: {
  searchParams: { category?: string; page?: string; gw?: string };
}) {
  if (process.env.COMING_SOON === "true") {
    return <ComingSoon />;
  }

  const t = await getTranslations("dashboard");

  const [session, season] = await Promise.all([auth(), prisma.season.findFirst({ where: { isActive: true } })]);

  const category = VALID_CATEGORIES.includes(searchParams.category as NewsCategory)
    ? (searchParams.category as NewsCategory)
    : null;
  const page = searchParams.page ? Number(searchParams.page) : 1;
  // Journée forcée pour le strip "prochains matchs" (dropdown de navigation,
  // demande explicite de l'utilisateur) — absente/invalide = comportement par
  // défaut (auto-détection de la prochaine journée non close), voir
  // getDashboardMatchStrips.
  const gwOverrideParsed = searchParams.gw ? Number(searchParams.gw) : NaN;
  const gwOverride = Number.isInteger(gwOverrideParsed) && gwOverrideParsed > 0 ? gwOverrideParsed : undefined;

  if (!season) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="text-text-muted">{t("home.noActiveSeason")}</p>
      </main>
    );
  }

  const [
    standings,
    matchStrips,
    totalGameweeks,
    newsFeed,
    teamOfWeek,
    performances,
    leaders,
    warmupMatches,
    coupeDeFranceMatches,
    championsLeagueMatches,
    europeanLeagueMatches,
    todayMatches,
    clubs,
  ] = await Promise.all([
    getClubStandings(season.id),
    getDashboardMatchStrips(season.id, gwOverride),
    prisma.gameweek.count({ where: { seasonId: season.id } }),
    getNewsFeed(season.id, { category: category ?? undefined, page }),
    getTeamOfWeekCard(season.id),
    getPerformancesCard(season.id),
    getWeeklyStatLeaders(season.id),
    getWarmupMatches(season.id),
    getCoupeDeFranceMatches(season.id),
    getChampionsLeagueMatches(season.id),
    getEuropeanLeagueMatches(season.id),
    getTodayMatches(season.id),
    getActiveClubs(season.id),
  ]);

  // Position au classement Starligue de chaque club — affichée discrètement (entre
  // parenthèses) à côté des logos dans les strips championnat ci-dessous (demande
  // explicite de l'utilisateur), même source que le widget "Classement Starligue".
  const rankByClubId: Record<string, number> = Object.fromEntries(standings.rows.map((r) => [r.clubId, r.rank]));

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 pb-16 pt-6 sm:px-6">
      <IntroSplash clubs={clubs} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-arcade text-sm uppercase tracking-[0.3em] text-accent-secondary">
            {t("home.seasonLabel", { label: season.label })}
          </p>
          <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("home.title")}</h1>
        </div>
        <TodayMatchCarousel matches={todayMatches} />
      </div>

      <div className="pixel-corners flex flex-col items-start gap-2 border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        {session?.user ? (
          <p className="text-sm text-text">
            {t.rich("home.welcomeBack", {
              name: session.user.name ?? "",
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
          </p>
        ) : (
          <p className="text-sm text-text">{t("home.welcomeGuest")}</p>
        )}
        <Link
          href={session?.user ? "/dashboard" : "/register"}
          className="shrink-0 rounded-lg bg-accent-secondary px-4 py-2 text-center font-display text-sm uppercase tracking-wide text-bg shadow-[0_4px_0_0_theme(colors.accent.secondary/0.4)] transition-[transform,box-shadow,background-color] duration-100 hover:bg-accent-secondary/90 active:translate-y-[3px] active:shadow-[0_1px_0_0_theme(colors.accent.secondary/0.4)]"
        >
          {session?.user ? t("home.ctaLoggedIn") : t("home.ctaGuest")}
        </Link>
      </div>

      {/* Les 16 clubs Starligue de la saison. Sur mobile : grille 8 colonnes (2
          lignes) avec logos réduits pour voir tout le monde sans scroller. Sur
          desktop (sm:) : inchangé, une seule ligne pleine largeur. */}
      <div className="pixel-corners grid grid-cols-8 place-items-center gap-1 border border-border bg-surface px-3 py-3 sm:flex sm:items-center sm:justify-between sm:overflow-x-auto">
        {clubs.map((club) => (
          <ClubLogoLink key={club.id} club={club} />
        ))}
      </div>

      {/* Actus au centre (colonne dominante) ; résultats + classement à gauche,
          matchs à venir/équipe type/leaders à droite. Sur mobile : actus en
          premier (contenu principal demandé), puis le bloc matchs/perfs, puis
          résultats+classement. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <NewsFeed feed={newsFeed} activeCategory={category} />
        </div>

        <div className="flex flex-col gap-4 lg:col-start-3 lg:row-start-1">
          <MatchesStrip
            variant="upcoming"
            gameweekNumber={matchStrips.upcoming.gameweekNumber}
            matches={matchStrips.upcoming.matches}
            fixedColumns={2}
            tone="highlight"
            rankByClubId={rankByClubId}
            gameweekNav={{ total: totalGameweeks, hrefBase: "/" }}
            collapsible
            defaultOpen={false}
          />
          {warmupMatches.length > 0 && (
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={null}
              matches={warmupMatches}
              fixedColumns={2}
              title={t("warmup.title")}
              disableLink
              showDate
              collapsible
              defaultOpen={false}
            />
          )}
          {coupeDeFranceMatches.length > 0 && (
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={null}
              matches={coupeDeFranceMatches}
              fixedColumns={2}
              title={t("coupeDeFrance.title")}
              disableLink
              showDate
              collapsible
              defaultOpen={false}
            />
          )}
          {championsLeagueMatches.length > 0 && (
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={null}
              matches={championsLeagueMatches.map((m) => ({
                id: m.id,
                homeClub: m.homeClub,
                awayClub: m.awayClub,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                kickoffAt: m.kickoffAt,
                href: m.groupLabel ? `/matches/ehf/${ehfCompetitionSlug("championsLeague")}/${m.groupLabel}` : undefined,
              }))}
              fixedColumns={2}
              title={t("championsLeague.title")}
              disableLink
              showDate
              collapsible
              defaultOpen={false}
            />
          )}
          {europeanLeagueMatches.length > 0 && (
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={null}
              matches={europeanLeagueMatches.map((m) => ({
                id: m.id,
                homeClub: m.homeClub,
                awayClub: m.awayClub,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                kickoffAt: m.kickoffAt,
                href: m.groupLabel ? `/matches/ehf/${ehfCompetitionSlug("europeanLeague")}/${m.groupLabel}` : undefined,
              }))}
              fixedColumns={2}
              title={t("europeanLeague.title")}
              disableLink
              showDate
              collapsible
              defaultOpen={false}
            />
          )}
          {teamOfWeek && <StarligueBestXICard gameweekNumber={teamOfWeek.gameweekNumber} entries={teamOfWeek.entries} />}
          {performances && (
            <StarliguePerformancesCard gameweekNumber={performances.gameweekNumber} entries={performances.entries} />
          )}
          <StatLeadersSection gameweekNumber={leaders.gameweekNumber} categories={leaders.categories} />
        </div>

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <MatchesStrip
            variant="results"
            gameweekNumber={matchStrips.lastResults.gameweekNumber}
            matches={matchStrips.lastResults.matches}
            fixedColumns={2}
            rankByClubId={rankByClubId}
          />
          <StandingsSection gameweekNumber={standings.gameweekNumber} rows={standings.rows} />
        </div>
      </div>

      <p className="pt-2 text-center text-[11px] text-text-muted/60">
        {t("home.footerDisclaimer")} ·{" "}
        <Link href="/confidentialite" className="hover:underline">
          {t("home.footerPrivacyLink")}
        </Link>
      </p>
    </main>
  );
}
