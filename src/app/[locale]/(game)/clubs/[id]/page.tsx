import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import { getClubPageData } from "@/lib/clubs/club-page-data";
import {
  getClubWarmupMatches,
  getClubCoupeDeFranceMatches,
  getClubChampionsLeagueMatches,
  getClubEuropeanLeagueMatches,
} from "@/lib/matches/get-warmup-matches";
import { getClubStandings } from "@/lib/standings/get";
import { POSITIONS } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { ClubGoalsChart } from "@/components/charts/ClubGoalsChart";
import { ClubMatchesPanel } from "@/components/clubs/ClubMatchesPanel";

export default async function ClubPage({ params }: { params: { id: string } }) {
  const t = await getTranslations("labels");
  const tClubs = await getTranslations("clubs");
  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);
  if (!season) notFound();

  const club = await prisma.club.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  if (!club) notFound();

  const [
    roster,
    { results, upcoming, goalsChartEntries },
    warmupMatches,
    coupeDeFranceMatches,
    championsLeagueMatches,
    europeanLeagueMatches,
    standings,
  ] = await Promise.all([
    prisma.player.findMany({
      where: { clubId: club.id, seasonId: season.id },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, position: true, photoUrl: true, marketValue: true },
    }),
    getClubPageData(club.id, season.id, mode),
    getClubWarmupMatches(club.id, season.id),
    getClubCoupeDeFranceMatches(club.id, season.id),
    getClubChampionsLeagueMatches(club.id, season.id),
    getClubEuropeanLeagueMatches(club.id, season.id),
    getClubStandings(season.id),
  ]);

  // Rang actuel de chaque adversaire pour l'info-bulle des matchs Starligue
  // (ClubMatchesPanel) — demande explicite de l'utilisateur ("son classement
  // actuel"), donc le dernier snapshot connu, pas le rang au moment du match.
  // Record plutôt que Map : ClubMatchesPanel est un Client Component, garder un
  // type trivialement sérialisable à travers la frontière RSC.
  const rankByClubId: Record<string, number> = Object.fromEntries(standings.rows.map((r) => [r.clubId, r.rank]));

  const rosterByPosition = POSITIONS.map((pos) => ({
    position: pos,
    players: roster.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  const isSimulation = season.label === SIMULATION_SEASON_LABEL;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {tClubs("detail.backToDashboard")}
      </Link>

      {/* Club header */}
      <div className="flex items-center gap-4 pixel-corners border border-border bg-surface p-4">
        <ClubLogo club={club} size="xl" largeOnDesktop />
        <div>
          <h1 className="text-2xl text-text">{club.name}</h1>
          <p className="text-sm text-text-muted">
            {isSimulation ? tClubs("detail.simulation") : tClubs("detail.season")} {season.label}
          </p>
        </div>
      </div>

      {/* Résultats / prochains matchs — championnat + Warm Up + Coupe de France +
          EHF Champions League + EHF European League fusionnés, filtrables par
          compétition et domicile-extérieur (ARCHITECTURE.md §19) */}
      <ClubMatchesPanel
        club={club}
        results={results}
        upcoming={upcoming}
        warmupMatches={warmupMatches}
        coupeDeFranceMatches={coupeDeFranceMatches}
        championsLeagueMatches={championsLeagueMatches}
        europeanLeagueMatches={europeanLeagueMatches}
        rankByClubId={rankByClubId}
      />

      {/* Buts marqués/encaissés par journée */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {tClubs("detail.goalsByGameweek")}
        </p>
        <div className="pixel-corners border border-border bg-surface p-4">
          <ClubGoalsChart entries={goalsChartEntries} />
        </div>
      </div>

      {/* Effectif */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {tClubs("detail.rosterCount", { count: roster.length })}
        </p>
        {rosterByPosition.length === 0 ? (
          <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm text-text-muted">{tClubs("detail.noPlayers")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rosterByPosition.map((g) => (
              <div key={g.position}>
                <p className="mb-1.5 text-[10px] uppercase tracking-widest text-text-muted">
                  {t(`position.${g.position}`)}
                </p>
                <div className="overflow-hidden pixel-corners border border-border bg-surface">
                  <div className="divide-y divide-border">
                    {g.players.map((p) => (
                      <Link
                        key={p.id}
                        href={`/players/${p.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20"
                      >
                        <PlayerAvatar player={p} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="w-16 shrink-0 text-right font-arcade text-lg tracking-wide text-accent-secondary">
                          {Number(p.marketValue).toFixed(1)}M
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
