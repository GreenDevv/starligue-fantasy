import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { OutcomeBadge } from "@/components/ui/OutcomeBadge";
import { hasPendingMatchThisRound } from "@/lib/standings/pending-match";
import type { FullRanking } from "@/lib/standings/full-ranking";

// Classement complet "tout-en-un" (/ranking) : classement général + forme (5
// derniers résultats) + prochain adversaire par club — demande explicite du
// 13/09, ARCHITECTURE.md §34. Server Component (pas d'interactivité propre,
// contrairement à ClubStandingsWidget qui gère plusieurs tailles de widget) —
// useFormatter marche aussi bien côté serveur que client avec next-intl.
export async function RankingTable({ gameweekNumber, liveMatchesCounted, rows }: FullRanking) {
  const [t, format] = await Promise.all([getTranslations("ranking"), getFormatter()]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">{t("notAvailable")}</p>;
  }

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {liveMatchesCounted > 0 && (
          <span className="pixel-corners-sm bg-points-neg/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-points-neg shadow-glow-red">
            {t("live")}
          </span>
        )}
        {gameweekNumber !== null && (
          <p className="ml-auto text-[10px] uppercase tracking-widest text-text-muted">
            {t("afterGameweek", { number: gameweekNumber })}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-text-muted">
              <th className="w-6 py-1 text-left font-normal">#</th>
              <th className="py-1 text-left font-normal">{t("col.club")}</th>
              <th className="w-8 py-1 text-right font-normal">{t("col.played")}</th>
              <th className="w-8 py-1 text-right font-normal">{t("col.wins")}</th>
              <th className="w-8 py-1 text-right font-normal">{t("col.draws")}</th>
              <th className="w-8 py-1 text-right font-normal">{t("col.losses")}</th>
              <th className="w-10 py-1 text-right font-normal">{t("col.diff")}</th>
              <th className="w-10 py-1 text-right font-semibold text-text">{t("col.points")}</th>
              <th className="py-1 pl-3 text-left font-normal">{t("col.form")}</th>
              <th className="py-1 pl-3 text-left font-normal">{t("col.nextOpponent")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId} className="border-t border-border/60">
                <td className="py-1.5 text-text-muted tabular-nums">{r.rank}</td>
                <td className="py-1.5">
                  <Link href={`/clubs/${r.clubId}`} className="flex items-center gap-1.5 hover:text-accent">
                    <ClubLogo club={{ shortName: r.clubShortName, name: r.clubName, logoUrl: r.logoUrl }} size="xs" />
                    <span className="truncate text-text">{r.clubShortName}</span>
                    {hasPendingMatchThisRound(r.played, gameweekNumber) && (
                      <span className="shrink-0 text-[10px] font-bold text-points-neg" title={t("pendingMatchTitle")}>
                        -1
                      </span>
                    )}
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">{r.played}</td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">{r.wins}</td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">{r.draws}</td>
                <td className="py-1.5 text-right tabular-nums text-text-muted">{r.losses}</td>
                <td
                  className={`py-1.5 text-right tabular-nums ${
                    r.goalAvg > 0 ? "text-points-pos" : r.goalAvg < 0 ? "text-points-neg" : "text-text-muted"
                  }`}
                >
                  {r.goalAvg > 0 ? `+${r.goalAvg}` : r.goalAvg}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-accent">{r.points}</td>
                <td className="py-1.5 pl-3">
                  {r.form.length === 0 ? (
                    <span className="text-text-muted/60">—</span>
                  ) : (
                    <div className="flex gap-0.5">
                      {r.form.map((outcome, i) => (
                        <OutcomeBadge key={i} outcome={outcome} />
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pl-3">
                  {r.nextOpponent ? (
                    <NextOpponentCell opponent={r.nextOpponent} dateLabel={format.dateTime(r.nextOpponent.kickoffAt, { day: "2-digit", month: "short" })} />
                  ) : (
                    <span className="text-text-muted/60">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NextOpponentCell({
  opponent,
  dateLabel,
}: {
  opponent: NonNullable<FullRanking["rows"][number]["nextOpponent"]>;
  dateLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-text-muted">
      <span className="text-[10px]">{opponent.isHome ? "vs" : "@"}</span>
      <ClubLogo club={opponent} size="xs" />
      <span className="truncate">{opponent.shortName}</span>
      <span className="text-[10px]">{dateLabel}</span>
    </div>
  );
}
