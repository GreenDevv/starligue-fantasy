import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClubStandings } from "@/lib/standings/get";
import { getDashboardMatchStrips } from "@/lib/matches/dashboard-strips";
import { getNewsFeed } from "@/lib/news/get-feed";
import { getTeamOfWeekCard, getPerformancesCard } from "@/lib/news/get-weekly-cards";
import { getWeeklyStatLeaders } from "@/lib/stats/get-weekly-leaders";
import { getWarmupMatches, getCoupeDeFranceMatches } from "@/lib/matches/get-warmup-matches";
import { getActiveClubs } from "@/lib/clubs/get-active-clubs";
import { MatchesStrip } from "@/components/dashboard/MatchesStrip";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { StandingsSection } from "@/components/starligue/StandingsSection";
import { NewsFeed } from "@/components/starligue/NewsFeed";
import { StarligueBestXICard } from "@/components/starligue/StarligueBestXICard";
import { StarliguePerformancesCard } from "@/components/starligue/StarliguePerformancesCard";
import { StatLeadersSection } from "@/components/starligue/StatLeadersSection";
import { AuthButton } from "@/components/auth/AuthButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ComingSoon } from "@/components/ComingSoon";
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
// jeu Fantasy Starligue (connexion/déconnexion, message de bienvenue). Publique —
// hors PROTECTED_PREFIXES (src/lib/auth.ts), accessible sans compte, pas de
// redirection non plus pour un utilisateur déjà connecté. Anciennement /starligue,
// devenu la home sur demande explicite ; /starligue redirige ici désormais
// (src/app/(public)/starligue/page.tsx), /starligue/[id] (détail d'une actu) reste
// à son emplacement d'origine.
export default async function HomePage({
  searchParams,
}: {
  searchParams: { category?: string; page?: string };
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

  if (!season) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="text-text-muted">{t("home.noActiveSeason")}</p>
      </main>
    );
  }

  const [standings, matchStrips, newsFeed, teamOfWeek, performances, leaders, warmupMatches, coupeDeFranceMatches, clubs] =
    await Promise.all([
      getClubStandings(season.id),
      getDashboardMatchStrips(season.id),
      getNewsFeed(season.id, { category: category ?? undefined, page }),
      getTeamOfWeekCard(season.id),
      getPerformancesCard(season.id),
      getWeeklyStatLeaders(season.id),
      getWarmupMatches(season.id),
      getCoupeDeFranceMatches(season.id),
      getActiveClubs(season.id),
    ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-arcade text-sm uppercase tracking-[0.3em] text-accent-secondary">
            {t("home.seasonLabel", { label: season.label })}
          </p>
          <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("home.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <AuthButton userName={session?.user?.name} />
        </div>
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

      {/* Les 16 clubs Starligue de la saison, une seule ligne sur toute la largeur
          (scrollable horizontalement sur mobile si jamais ça ne tient pas). */}
      <div className="pixel-corners flex items-center justify-between gap-1 overflow-x-auto border border-border bg-surface px-3 py-3">
        {clubs.map((club) => (
          <Link key={club.id} href={`/clubs/${club.id}`} className="shrink-0 transition-opacity hover:opacity-80">
            <ClubLogo club={club} size="lg" title={club.name} />
          </Link>
        ))}
      </div>

      {/* Actus au centre (colonne dominante) ; classement d'un côté, matchs/équipe
          type/leaders de l'autre. Sur mobile : actus en premier (contenu principal
          demandé), puis le bloc matchs/perfs, puis le classement. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <NewsFeed feed={newsFeed} activeCategory={category} />
        </div>

        <div className="flex flex-col gap-4 lg:col-start-3 lg:row-start-1">
          <div className="flex flex-col gap-3">
            <MatchesStrip
              variant="results"
              gameweekNumber={matchStrips.lastResults.gameweekNumber}
              matches={matchStrips.lastResults.matches}
              fixedColumns={2}
            />
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={matchStrips.upcoming.gameweekNumber}
              matches={matchStrips.upcoming.matches}
              fixedColumns={2}
            />
          </div>
          {warmupMatches.length > 0 && (
            <MatchesStrip
              variant="upcoming"
              gameweekNumber={null}
              matches={warmupMatches}
              fixedColumns={2}
              title={t("warmup.title")}
              disableLink
              showDate
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
            />
          )}
          {teamOfWeek && <StarligueBestXICard gameweekNumber={teamOfWeek.gameweekNumber} entries={teamOfWeek.entries} />}
          {performances && (
            <StarliguePerformancesCard gameweekNumber={performances.gameweekNumber} entries={performances.entries} />
          )}
          <StatLeadersSection gameweekNumber={leaders.gameweekNumber} categories={leaders.categories} />
        </div>

        <div className="lg:col-start-1 lg:row-start-1">
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
