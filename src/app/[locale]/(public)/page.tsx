import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClubStandings } from "@/lib/standings/get";
import { getDashboardMatchStrips, getCurrentGameweekStrip } from "@/lib/matches/dashboard-strips";
import { getCurrentGameweekStatus } from "@/lib/gameweek/get-gameweek-status";
import { getCurrentGameweekPerformances } from "@/lib/matches/current-gameweek-performances";
import { getNewsFeed } from "@/lib/news/get-feed";
import { getTeamOfWeekCard, getPerformancesCard } from "@/lib/news/get-weekly-cards";
import { getWeeklyStatLeaders } from "@/lib/stats/get-weekly-leaders";
import { getLiveStatLeaders } from "@/lib/stats/get-live-leaders";
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
import { GameweekStateBadge } from "@/components/gameweek/GameweekStateBadge";
import { TodayMatchCarousel } from "@/components/dashboard/TodayMatchCarousel";
import { LiveRefresher } from "@/components/live/LiveRefresher";
import { ClubLogoLink } from "@/components/starligue/ClubLogoLink";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StandingsSection } from "@/components/starligue/StandingsSection";
import { NewsFeed } from "@/components/starligue/NewsFeed";
import { StarligueBestXICard } from "@/components/starligue/StarligueBestXICard";
import { StarliguePerformancesCard } from "@/components/starligue/StarliguePerformancesCard";
import { StatLeadersSection } from "@/components/starligue/StatLeadersSection";
import { LiveStatLeadersSection } from "@/components/starligue/LiveStatLeadersSection";
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
    liveLeaders,
    warmupMatches,
    coupeDeFranceMatches,
    championsLeagueMatches,
    europeanLeagueMatches,
    todayMatches,
    clubs,
    currentGwStrip,
    currentGwStatus,
    currentGwPerfs,
  ] = await Promise.all([
    getClubStandings(season.id),
    getDashboardMatchStrips(season.id, gwOverride),
    prisma.gameweek.count({ where: { seasonId: season.id } }),
    getNewsFeed(season.id, { category: category ?? undefined, page }),
    getTeamOfWeekCard(season.id),
    getPerformancesCard(season.id),
    getWeeklyStatLeaders(season.id),
    getLiveStatLeaders(season.id),
    getWarmupMatches(season.id),
    getCoupeDeFranceMatches(season.id),
    getChampionsLeagueMatches(season.id),
    getEuropeanLeagueMatches(season.id),
    getTodayMatches(season.id),
    getActiveClubs(season.id),
    getCurrentGameweekStrip(season.id),
    getCurrentGameweekStatus(season.id),
    getCurrentGameweekPerformances(season.id),
  ]);

  // Bande "journée de championnat en cours" — mise en avant quand la J en cours
  // n'est pas confirmée et qu'il reste des matchs à jouer / en train de se jouer.
  const showCurrentGwBand =
    currentGwStrip !== null &&
    currentGwStatus !== null &&
    (currentGwStatus.state === "LIVE" || currentGwStatus.state === "AWAITING_RESULTS");

  // Position au classement Starligue de chaque club — affichée discrètement (entre
  // parenthèses) à côté des logos dans les strips championnat ci-dessous (demande
  // explicite de l'utilisateur), même source que le widget "Classement Starligue".
  const rankByClubId: Record<string, number> = Object.fromEntries(standings.rows.map((r) => [r.clubId, r.rank]));

  // Fenêtre live : au moins un match aujourd'hui dont le coup d'envoi tombe dans
  // [now-3h, now+30min] → la home se rafraîchit toute seule (scores + classement).
  const nowMs = Date.now();
  const liveWindowActive = todayMatches.some((m) => {
    const k = new Date(m.kickoffAt).getTime();
    return k >= nowMs - 3 * 60 * 60 * 1000 && k <= nowMs + 30 * 60 * 1000;
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 pb-16 pt-6 sm:px-6">
      <LiveRefresher active={liveWindowActive} />
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

      {/* Journée de championnat EN COURS — mise en avant : tous les matchs de la
          journée (joués + en direct + à venir) d'un coup d'œil. */}
      {showCurrentGwBand && (
        <section className="pixel-corners border border-accent-secondary/60 bg-accent-secondary/[0.06] p-3 shadow-glow-amber sm:p-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <GameweekStateBadge state={currentGwStatus!.state} tone={currentGwStatus!.tone} />
            <p className="font-display text-base uppercase tracking-wide text-text">
              {t("home.currentGameweekBand", { number: currentGwStrip!.gameweekNumber })}
            </p>
          </div>
          <MatchesStrip
            variant="results"
            gameweekNumber={null}
            matches={currentGwStrip!.matches}
            size="wide"
            rankByClubId={rankByClubId}
            showDate
            hideHeader
          />

          {currentGwPerfs && currentGwPerfs.entries.length > 0 && (
            <div className="mt-3 border-t border-accent-secondary/25 pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-accent-secondary">
                {t("home.currentGameweekPerfs")}
              </p>
              <ol className="flex flex-col gap-1.5">
                {currentGwPerfs.entries.map((e, i) => (
                  <li key={e.playerId} className="flex items-center gap-2 text-sm">
                    <span className="w-3 shrink-0 text-center font-arcade text-xs text-text-muted">{i + 1}</span>
                    <PlayerAvatar player={e} size="xs" variant="photo" focus="head" />
                    <Link href={`/players/${e.playerId}`} className="min-w-0 flex-1 truncate text-text hover:text-accent">
                      {e.firstName} {e.lastName}
                    </Link>
                    <ClubLogo club={e.club} size="xs" />
                    {e.lnhRating !== null && (
                      <span
                        className={`w-8 shrink-0 text-right font-arcade text-base tabular-nums ${
                          e.lnhRating >= 7 ? "text-points-pos" : e.lnhRating < 5 ? "text-points-neg" : "text-text"
                        }`}
                      >
                        {e.lnhRating.toFixed(1)}
                      </span>
                    )}
                    <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
                      {e.points > 0 ? "+" : ""}
                      {e.points} pts
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

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
          <LiveStatLeadersSection categories={liveLeaders} />
          <StatLeadersSection gameweekNumber={leaders.gameweekNumber} categories={leaders.categories} />
        </div>

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          {/* Rail gauche = 240px sur desktop : logos réduits ("sm") + 1 match par
              ligne (2-up seulement sur mobile où la colonne est pleine largeur),
              sinon les logos "lg" + le score débordaient l'encart (feedback
              2026-09-07, à deux reprises). */}
          <MatchesStrip
            variant="results"
            gameweekNumber={matchStrips.lastResults.gameweekNumber}
            matches={matchStrips.lastResults.matches}
            gridColsClassName="grid-cols-2 lg:grid-cols-1"
            logoSize="sm"
            rankByClubId={rankByClubId}
          />
          <StandingsSection gameweekNumber={standings.gameweekNumber} rows={standings.rows} />
        </div>
      </div>

      <p className="pt-2 text-center text-[11px] text-text-muted/60">
        {t("home.footerDisclaimer")} ·{" "}
        <Link href="/confidentialite" className="hover:underline">
          {t("home.footerPrivacyLink")}
        </Link>{" "}
        ·{" "}
        <Link href="/support" className="hover:underline">
          {t("home.footerSupportLink")}
        </Link>
      </p>
    </main>
  );
}
