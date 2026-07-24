import { notFound } from "next/navigation";
import Link from "next/link";
import { getMatchDetail, type MatchBoxscorePlayerRow, type MatchTeamBoxscore } from "@/lib/matches/get-match-detail";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function ratingCell(value: number | null) {
  if (value === null) return <span className="text-text-muted">—</span>;
  return (
    <span className={value >= 7 ? "font-semibold text-points-pos" : value < 5 ? "text-points-neg" : "text-text"}>
      {value.toFixed(1)}
    </span>
  );
}

function statCell(value: number | null, category: "bonus" | "malus") {
  if (value === null) return <span className="text-text-muted">—</span>;
  if (category === "malus" && value > 0) return <span className="text-points-neg">{value}</span>;
  return <span className="text-text">{value}</span>;
}

function GoalkeepersTable({ rows }: { rows: MatchBoxscorePlayerRow[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (b.lnhRating ?? -1) - (a.lnhRating ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
            <th className="py-1 text-left font-normal">Gardien</th>
            <th className="w-16 py-1 text-right font-normal">Arrêts</th>
            <th className="w-14 py-1 text-right font-normal">% Arrêts</th>
            <th className="w-14 py-1 text-right font-normal">Note</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldPlayersTable({ rows }: { rows: MatchBoxscorePlayerRow[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (b.lnhRating ?? -1) - (a.lnhRating ?? -1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
            <th className="py-1 text-left font-normal">Joueur</th>
            <th className="w-14 py-1 text-right font-normal">Note</th>
            {STAT_LINES.map((l) => (
              <th key={l.key} className="w-16 py-1 text-right font-normal">
                {l.label}
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

function TeamBoxscore({ team }: { team: MatchTeamBoxscore }) {
  const hasStats = team.goalkeepers.length > 0 || team.fieldPlayers.length > 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <ClubLogo club={team.club} size="sm" />
        <p className="text-sm font-medium text-text">{team.club.name}</p>
      </div>
      {!hasStats ? (
        <p className="py-3 text-center text-xs text-text-muted">Aucune statistique disponible pour cette équipe.</p>
      ) : (
        <div className="pixel-corners flex flex-col gap-3 border border-border bg-surface p-3">
          <GoalkeepersTable rows={team.goalkeepers} />
          <FieldPlayersTable rows={team.fieldPlayers} />
        </div>
      )}
    </div>
  );
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const match = await getMatchDetail(params.id);
  if (!match) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/clubs/${match.home.club.id}/vs/${match.away.club.id}`}
        className="text-sm text-text-muted hover:text-text transition-colors"
      >
        ← {match.home.club.shortName} vs {match.away.club.shortName}
      </Link>

      {/* Score */}
      <div className="pixel-corners flex items-center justify-center gap-4 border border-border bg-surface p-4 shadow-[0_0_20px_rgba(45,212,191,0.1)]">
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
      <p className="-mt-3 text-center text-xs text-text-muted">
        Journée {match.gameweekNumber} · {formatDate(match.kickoffAt)} · {match.seasonLabel}
      </p>

      {/* Boxscore */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Statistiques du match</p>
        <div className="flex flex-col gap-5">
          <TeamBoxscore team={match.home} />
          <TeamBoxscore team={match.away} />
        </div>
      </div>
    </div>
  );
}
