import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { GameweekTimeline } from "@/components/matches/GameweekTimeline";
import { getClubStandings } from "@/lib/standings/get";

interface Props {
  searchParams: { gw?: string };
}

export default async function MatchesPage({ searchParams }: Props) {
  const t = await getTranslations("matches");
  const format = await getFormatter();

  function formatKickoff(date: Date): string {
    return format.dateTime(date, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return (
      <div className="py-12 text-center text-text-muted">
        {t("list.noActiveSeason")}
      </div>
    );
  }

  const now = new Date();

  const gwParam = searchParams.gw ? parseInt(searchParams.gw, 10) : null;

  let gwNumber: number;
  if (gwParam && !isNaN(gwParam)) {
    gwNumber = gwParam;
  } else {
    const next = await prisma.gameweek.findFirst({
      where: { seasonId: season.id, deadlineAt: { gt: now } },
      orderBy: { number: "asc" },
      select: { number: true },
    });
    const last = await prisma.gameweek.findFirst({
      where: { seasonId: season.id },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    gwNumber = next?.number ?? last?.number ?? 1;
  }

  const [gameweek, totalGameweeks, standings] = await Promise.all([
    prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId: season.id, number: gwNumber } },
      include: {
        matches: {
          include: {
            homeClub: { select: { id: true, shortName: true, name: true, logoUrl: true } },
            awayClub: { select: { id: true, shortName: true, name: true, logoUrl: true } },
          },
          orderBy: { kickoffAt: "asc" },
        },
      },
    }),
    prisma.gameweek.count({ where: { seasonId: season.id } }),
    getClubStandings(season.id),
  ]);

  const prevGw = gwNumber > 1 ? gwNumber - 1 : null;
  const nextGw = gwNumber < totalGameweeks ? gwNumber + 1 : null;

  // Position au classement Starligue de chaque club — affichée discrètement (entre
  // parenthèses) à côté des logos ci-dessous (demande explicite de l'utilisateur).
  const rankByClubId: Record<string, number> = Object.fromEntries(standings.rows.map((r) => [r.clubId, r.rank]));
  const gameweekItems = Array.from({ length: totalGameweeks }, (_, i) => {
    const number = i + 1;
    return { number, label: t("list.gameweekShort", { number }) };
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl text-text">{t("list.title")}</h1>

      {/* Gameweek navigation */}
      <div className="pixel-corners flex items-center justify-between border border-border bg-surface px-4 py-2.5">
        {prevGw ? (
          <Link
            href={`/matches?gw=${prevGw}`}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            ← {t("list.gameweekShort", { number: prevGw })}
          </Link>
        ) : (
          <span className="text-sm text-text-muted/30">←</span>
        )}

        <span className="font-display text-sm uppercase tracking-wide text-text">
          {t("list.gameweek", { number: gwNumber })}
        </span>

        {nextGw ? (
          <Link
            href={`/matches?gw=${nextGw}`}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            {t("list.gameweekShort", { number: nextGw })} →
          </Link>
        ) : (
          <span className="text-sm text-text-muted/30">→</span>
        )}
      </div>

      {/* Timeline horizontale — navigation directe vers n'importe quelle journée
          (demande explicite de l'utilisateur, en complément des flèches ci-dessus) */}
      <GameweekTimeline items={gameweekItems} current={gwNumber} hrefBase="/matches" />

      {/* Matches */}
      {!gameweek ? (
        <div className="py-8 text-center text-text-muted">{t("list.notFound")}</div>
      ) : gameweek.matches.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center text-text-muted">
          {t("list.empty")}
        </div>
      ) : (
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          <div className="divide-y divide-border">
            {gameweek.matches.map((m) => {
              const played = m.status === "FINISHED" || m.status === "LIVE";
              const homeWin = played && m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore;
              const awayWin = played && m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore;
              // Boxscore dispo une fois le match joué ; sinon on renvoie vers le head-to-head.
              const centerHref = played ? `/matches/${m.id}` : `/clubs/${m.homeClub.id}/vs/${m.awayClub.id}`;
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-3">
                  {/* Home club */}
                  <Link
                    href={`/clubs/${m.homeClub.id}`}
                    className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right transition-colors hover:text-accent"
                  >
                    <p className={`truncate text-sm ${homeWin ? "font-semibold text-text" : "text-text-muted"}`}>
                      {m.homeClub.shortName}
                      {rankByClubId[m.homeClub.id] !== undefined && (
                        <span className="text-text-muted/70"> ({rankByClubId[m.homeClub.id]})</span>
                      )}
                    </p>
                    <ClubLogo club={m.homeClub} size="sm" />
                  </Link>

                  {/* Score or date */}
                  <Link
                    href={centerHref}
                    className="w-24 shrink-0 rounded-md text-center transition-colors hover:bg-border/20"
                  >
                    {played ? (
                      <p className="font-arcade text-lg tabular-nums text-text">
                        {m.homeScore} — {m.awayScore}
                      </p>
                    ) : (
                      <p className="text-[10px] leading-tight text-text-muted">
                        {formatKickoff(m.kickoffAt)}
                      </p>
                    )}
                    {m.status === "LIVE" && (
                      <span className="pixel-corners-sm mt-0.5 inline-block bg-points-neg/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-points-neg shadow-glow-red">
                        {t("list.live")}
                      </span>
                    )}
                  </Link>

                  {/* Away club */}
                  <Link
                    href={`/clubs/${m.awayClub.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-accent"
                  >
                    <ClubLogo club={m.awayClub} size="sm" />
                    <p className={`truncate text-sm ${awayWin ? "font-semibold text-text" : "text-text-muted"}`}>
                      {m.awayClub.shortName}
                      {rankByClubId[m.awayClub.id] !== undefined && (
                        <span className="text-text-muted/70"> ({rankByClubId[m.awayClub.id]})</span>
                      )}
                    </p>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deadline info */}
      {gameweek && (
        <p className="text-center text-xs text-text-muted">
          {t("list.deadline", {
            date: format.dateTime(gameweek.deadlineAt, {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </p>
      )}
    </div>
  );
}
