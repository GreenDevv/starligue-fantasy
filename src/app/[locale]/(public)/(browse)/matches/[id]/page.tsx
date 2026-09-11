import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import {
  getMatchDetail,
  type MatchBoxscorePlayerRow,
  type MatchTeamBoxscore,
  type MatchLiveEventRow,
} from "@/lib/matches/get-match-detail";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { LiveRefresher } from "@/components/live/LiveRefresher";
import { classifyLiveEventSentiment } from "@/lib/live/event-sentiment";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function ratingCell(value: number | null) {
  if (value === null) return <span className="text-text-muted">—</span>;
  return (
    <span className={value >= 7 ? "font-semibold text-points-pos" : value < 5 ? "text-points-neg" : "text-text"}>
      {value.toFixed(1)}
    </span>
  );
}

// Points fantasy que la ligne rapporte à un titulaire (§2.3) — affichés à côté de
// la note LNH pour rendre le scoring lisible (demande utilisateur : « rendre
// visible » sans changer le modèle).
function pointsCell(value: number | null) {
  if (value === null) return <span className="text-text-muted">—</span>;
  return (
    <span className={value > 0 ? "text-points-pos" : value < 0 ? "text-points-neg" : "text-text-muted"}>
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

function statCell(value: number | null, category: "bonus" | "malus") {
  if (value === null) return <span className="text-text-muted">—</span>;
  if (category === "malus" && value > 0) return <span className="text-points-neg">{value}</span>;
  return <span className="text-text">{value}</span>;
}

function GoalkeepersTable({ rows, t }: { rows: MatchBoxscorePlayerRow[]; t: Translator }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (b.lnhRating ?? -1) - (a.lnhRating ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
            <th className="py-1 text-left font-normal">{t("detail.goalkeeper")}</th>
            <th className="w-16 py-1 text-right font-normal">{t("detail.saves")}</th>
            <th className="w-14 py-1 text-right font-normal">{t("detail.savePercentage")}</th>
            <th className="w-14 py-1 text-right font-normal">{t("detail.rating")}</th>
            <th className="w-14 py-1 text-right font-normal">{t("detail.points")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.playerId} className="border-t border-border/60">
              <td className="py-1.5">
                <Link href={`/players/${p.playerId}`} className="flex items-center gap-2 hover:text-accent">
                  <PlayerAvatar player={p} size="xs" />
                  <span className="truncate text-text">
                    {p.firstName} {p.lastName}
                  </span>
                </Link>
              </td>
              <td className="py-1.5 text-right tabular-nums text-text">
                {p.saves ?? "—"}
                {p.shotsFaced !== null && <span className="text-text-muted">/{p.shotsFaced}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums text-text">
                {p.savePercentage !== null ? `${p.savePercentage.toFixed(0)}%` : "—"}
              </td>
              <td className="py-1.5 text-right tabular-nums">{ratingCell(p.lnhRating)}</td>
              <td className="py-1.5 text-right font-arcade tabular-nums">{pointsCell(p.fantasyPoints)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldPlayersTable({ rows, t, tLabels }: { rows: MatchBoxscorePlayerRow[]; t: Translator; tLabels: Translator }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (b.lnhRating ?? -1) - (a.lnhRating ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
            <th className="py-1 text-left font-normal">{t("detail.player")}</th>
            <th className="w-14 py-1 text-right font-normal">{t("detail.rating")}</th>
            <th className="w-14 py-1 text-right font-normal">{t("detail.points")}</th>
            {STAT_LINES.map((l) => (
              <th key={l.key} className="w-16 py-1 text-right font-normal">
                {tLabels(`statLine.${l.key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.playerId} className="border-t border-border/60">
              <td className="py-1.5">
                <Link href={`/players/${p.playerId}`} className="flex items-center gap-2 hover:text-accent">
                  <PlayerAvatar player={p} size="xs" />
                  <span className="truncate text-text">
                    {p.firstName} {p.lastName}
                  </span>
                </Link>
              </td>
              <td className="py-1.5 text-right tabular-nums">{ratingCell(p.lnhRating)}</td>
              <td className="py-1.5 text-right font-arcade tabular-nums">{pointsCell(p.fantasyPoints)}</td>
              {STAT_LINES.map((l) => (
                <td key={l.key} className="py-1.5 text-right tabular-nums">
                  {statCell(p[l.key as keyof MatchBoxscorePlayerRow] as number | null, l.category)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SENTIMENT_DOT: Record<ReturnType<typeof classifyLiveEventSentiment>, string> = {
  positive: "bg-points-pos",
  negative: "bg-points-neg",
  neutral: "bg-border",
};

// Fil du match — tous les événements lnh.fr (buts, cartons, arrêts…) du plus
// récent au plus ancien, voir get-match-detail.ts::liveEvents. Vide hors direct
// (matchs plus anciens que le 11/09, avant l'existence de MatchLiveEvent) — pas un
// bug, juste une donnée qui n'existait pas encore.
function EventsTimeline({ events, t }: { events: MatchLiveEventRow[]; t: Translator }) {
  if (events.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("detail.eventsTitle")}</p>
      <div className="pixel-corners flex flex-col gap-2 border border-border bg-surface p-3">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 text-xs">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SENTIMENT_DOT[classifyLiveEventSentiment(e.icon)]}`} />
            <span className="w-9 shrink-0 font-arcade text-sm tabular-nums text-accent-secondary">{e.minute}&apos;</span>
            {e.player ? (
              <Link href={`/players/${e.player.id}`} className="shrink-0 hover:opacity-80">
                <PlayerAvatar player={e.player} size="xs" />
              </Link>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            <span className="min-w-0 flex-1 text-text">{e.text}</span>
            <span className="shrink-0 font-arcade text-sm tabular-nums text-text-muted">
              {e.homeScore}-{e.awayScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamBoxscore({ team, t, tLabels }: { team: MatchTeamBoxscore; t: Translator; tLabels: Translator }) {
  const hasStats = team.goalkeepers.length > 0 || team.fieldPlayers.length > 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <ClubLogo club={team.club} size="sm" />
        <p className="text-sm font-medium text-text">{team.club.name}</p>
      </div>
      {!hasStats ? (
        <p className="py-3 text-center text-xs text-text-muted">{t("detail.noStats")}</p>
      ) : (
        <div className="pixel-corners flex flex-col gap-3 border border-border bg-surface p-3">
          <GoalkeepersTable rows={team.goalkeepers} t={t} />
          <FieldPlayersTable rows={team.fieldPlayers} t={t} tLabels={tLabels} />
        </div>
      )}
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const t = await getTranslations("matches");
  const tLabels = await getTranslations("labels");
  const format = await getFormatter();

  const match = await getMatchDetail(params.id);
  if (!match) notFound();

  function formatDate(date: Date): string {
    return format.dateTime(date, { day: "2-digit", month: "long", year: "numeric" });
  }

  const isLive = match.status === "LIVE";
  const liveLabel =
    isLive && match.livePeriod === "HT"
      ? t("detail.halfTime")
      : isLive && typeof match.liveMinute === "number"
        ? t("detail.live", { minute: match.liveMinute })
        : null;

  return (
    <div className="flex flex-col gap-5">
      {/* La page se rafraîchit toute seule pendant que ce match précis est en
          direct — même mécanisme que la home (Lot 1 du centre live). */}
      <LiveRefresher active={isLive} intervalMs={10_000} />

      {/* Score */}
      <div className="pixel-corners flex flex-col items-center gap-2 border border-border bg-surface p-4 shadow-[0_0_20px_rgba(45,212,191,0.1)]">
        {liveLabel && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-points-neg">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-neg opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-points-neg" />
            </span>
            {liveLabel}
          </span>
        )}
        <div className="flex w-full items-center justify-center gap-4">
          <Link href={`/clubs/${match.home.club.id}`} className="flex flex-1 flex-col items-center gap-2 text-center transition-colors hover:text-accent">
            <ClubLogo club={match.home.club} size="lg" />
            <span className="text-sm font-medium text-text">{match.home.club.name}</span>
          </Link>
          <span className="font-arcade text-3xl tracking-wide text-accent drop-shadow-[0_0_8px_currentColor]">
            {match.homeScore ?? "–"}-{match.awayScore ?? "–"}
          </span>
          <Link href={`/clubs/${match.away.club.id}`} className="flex flex-1 flex-col items-center gap-2 text-center transition-colors hover:text-accent">
            <ClubLogo club={match.away.club} size="lg" />
            <span className="text-sm font-medium text-text">{match.away.club.name}</span>
          </Link>
        </div>
      </div>
      <p className="-mt-3 text-center text-xs text-text-muted">
        {t("detail.summary", { number: match.gameweekNumber, date: formatDate(match.kickoffAt), season: match.seasonLabel })}
      </p>

      <Link
        href={`/clubs/${match.home.club.id}/vs/${match.away.club.id}`}
        className="pixel-corners-sm mx-auto inline-flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:border-accent/50 hover:text-text"
      >
        {t("detail.h2hHistory")} →
      </Link>

      <EventsTimeline events={match.liveEvents} t={t} />

      {/* Boxscore */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("detail.statsTitle")}</p>
        <div className="flex flex-col gap-5">
          <TeamBoxscore team={match.home} t={t} tLabels={tLabels} />
          <TeamBoxscore team={match.away} t={t} tLabels={tLabels} />
        </div>
      </div>
    </div>
  );
}
