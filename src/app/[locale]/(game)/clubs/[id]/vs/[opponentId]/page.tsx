import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import { getClubStandings, type ClubStandingRow } from "@/lib/standings/get";
import { getHeadToHead } from "@/lib/clubs/head-to-head";
import { ClubLogo } from "@/components/ui/ClubLogo";

export default async function ClubCompareVsPage({ params }: { params: { id: string; opponentId: string } }) {
  const tClubs = await getTranslations("clubs");
  const format = await getFormatter();

  const STAT_ROWS: { key: keyof ClubStandingRow; label: string }[] = [
    { key: "rank", label: tClubs("compare.stats.rank") },
    { key: "points", label: tClubs("compare.stats.points") },
    { key: "played", label: tClubs("compare.stats.played") },
    { key: "wins", label: tClubs("compare.stats.wins") },
    { key: "draws", label: tClubs("compare.stats.draws") },
    { key: "losses", label: tClubs("compare.stats.losses") },
    { key: "goalsFor", label: tClubs("compare.stats.goalsFor") },
    { key: "goalsAgainst", label: tClubs("compare.stats.goalsAgainst") },
    { key: "goalAvg", label: tClubs("compare.stats.goalDiff") },
  ];

  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);
  if (!season) notFound();

  const [clubA, clubB] = await Promise.all([
    prisma.club.findUnique({ where: { id: params.id }, select: { id: true, name: true, shortName: true, logoUrl: true } }),
    prisma.club.findUnique({ where: { id: params.opponentId }, select: { id: true, name: true, shortName: true, logoUrl: true } }),
  ]);
  if (!clubA || !clubB) notFound();

  const [standings, h2h] = await Promise.all([
    getClubStandings(season.id),
    getHeadToHead(clubA.id, clubB.id),
  ]);

  const standingA = standings.rows.find((r) => r.clubId === clubA.id) ?? null;
  const standingB = standings.rows.find((r) => r.clubId === clubB.id) ?? null;

  const winsA = h2h.filter((m) => m.clubAScore > m.clubBScore).length;
  const winsB = h2h.filter((m) => m.clubBScore > m.clubAScore).length;
  const draws = h2h.length - winsA - winsB;

  const isSimulation = season.label === SIMULATION_SEASON_LABEL;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/clubs/${clubA.id}`} className="text-sm text-text-muted hover:text-text transition-colors">
        ← {clubA.name}
      </Link>

      {/* Header face à face */}
      <div className="flex items-center justify-center gap-4 pixel-corners border border-border bg-surface p-4">
        <Link href={`/clubs/${clubA.id}`} className="flex flex-1 flex-col items-center gap-2 text-center hover:text-accent">
          <ClubLogo club={clubA} size="lg" />
          <span className="text-sm font-medium text-text">{clubA.name}</span>
        </Link>
        <span className="font-display text-lg uppercase tracking-widest text-text-muted">{tClubs("compare.vs")}</span>
        <Link href={`/clubs/${clubB.id}`} className="flex flex-1 flex-col items-center gap-2 text-center hover:text-accent">
          <ClubLogo club={clubB} size="lg" />
          <span className="text-sm font-medium text-text">{clubB.name}</span>
        </Link>
      </div>
      <p className="-mt-3 text-center text-xs text-text-muted">
        {isSimulation ? tClubs("detail.simulation") : tClubs("detail.season")} {season.label}
      </p>

      {/* Comparaison saison en cours */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {tClubs("compare.currentSeason")}
        </p>
        {!standingA || !standingB ? (
          <div className="pixel-corners border border-border bg-surface px-4 py-6 text-center">
            <p className="text-sm text-text-muted">{tClubs("compare.standingsUnavailable")}</p>
          </div>
        ) : (
          <div className="overflow-hidden pixel-corners border border-border bg-surface">
            <div className="divide-y divide-border">
              {STAT_ROWS.map((row) => {
                const a = standingA[row.key];
                const b = standingB[row.key];
                const higherIsBetter = row.key !== "rank" && row.key !== "goalsAgainst";
                const aWins = typeof a === "number" && typeof b === "number" && a !== b && (higherIsBetter ? a > b : a < b);
                const bWins = typeof a === "number" && typeof b === "number" && a !== b && (higherIsBetter ? b > a : b < a);
                return (
                  <div key={row.key} className="grid grid-cols-3 items-center px-3 py-2 text-sm">
                    <span className={`tabular-nums ${aWins ? "font-semibold text-accent" : "text-text"}`}>{a}</span>
                    <span className="text-center text-[10px] uppercase tracking-wide text-text-muted">{row.label}</span>
                    <span className={`text-right tabular-nums ${bWins ? "font-semibold text-accent" : "text-text"}`}>{b}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Historique des confrontations directes */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {tClubs("compare.headToHead")}
          {h2h.length > 0 && ` — ${tClubs("compare.headToHeadCount", { count: h2h.length })}`}
        </p>
        {h2h.length === 0 ? (
          <div className="pixel-corners border border-border bg-surface px-4 py-6 text-center">
            <p className="text-sm text-text-muted">{tClubs("compare.noHeadToHead")}</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-center text-xs text-text-muted">
              {tClubs("compare.headToHeadSummary", {
                winsA,
                clubA: clubA.shortName,
                draws,
                winsB,
                clubB: clubB.shortName,
              })}
            </p>
            <div className="overflow-hidden pixel-corners border border-border bg-surface">
              <div className="divide-y divide-border">
                {h2h.map((m, i) => {
                  const home = m.clubAIsHome ? clubA : clubB;
                  const away = m.clubAIsHome ? clubB : clubA;
                  const homeScore = m.clubAIsHome ? m.clubAScore : m.clubBScore;
                  const awayScore = m.clubAIsHome ? m.clubBScore : m.clubAScore;
                  const homeWon = homeScore > awayScore;
                  const awayWon = awayScore > homeScore;
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-16 shrink-0 text-[11px] text-text-muted">
                        {format.dateTime(m.playedAt, { day: "2-digit", month: "short", year: "numeric" })}
                        <br />
                        <span className="uppercase tracking-wide">{m.seasonLabel}</span>
                      </span>
                      <div className="flex flex-1 items-center justify-center gap-2">
                        <ClubLogo club={home} size="sm" />
                        <span
                          className={`font-arcade text-lg tracking-wide ${homeWon ? "text-points-pos" : awayWon ? "text-text-muted" : "text-text"}`}
                        >
                          {homeScore}
                        </span>
                        <span className="text-text-muted">-</span>
                        <span
                          className={`font-arcade text-lg tracking-wide ${awayWon ? "text-points-pos" : homeWon ? "text-text-muted" : "text-text"}`}
                        >
                          {awayScore}
                        </span>
                        <ClubLogo club={away} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
