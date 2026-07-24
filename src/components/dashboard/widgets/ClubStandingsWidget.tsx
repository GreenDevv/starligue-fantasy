import Link from "next/link";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { ClubStandingRow } from "@/lib/standings/get";
import type { WidgetSize } from "@/lib/dashboard/layout";

// Mini : logos seuls (plus gros, pas de colonnes, pas de lignes de séparation —
// l'ordre déjà trié par rang porte l'info, un numéro serait redondant). Carré :
// table réduite à Club/Diff/Pts (les 6 colonnes détaillées J/V/N/D/BP/BC ne
// tiennent pas et n'ont pas besoin d'être là pour un coup d'œil rapide). Long :
// table complète, horizontalement scrollable si jamais trop étroite.
export function ClubStandingsWidget({
  standings,
  gameweekNumber,
  size = "wide",
}: {
  standings: ClubStandingRow[];
  gameweekNumber: number | null;
  size?: WidgetSize;
}) {
  const showDetailedColumns = size === "wide";
  // Carré : Pts avant Diff (l'inverse du Long) — la stat qui compte le plus en
  // dernier lu, donc en premier ici où il n'y a que ces deux-là à comparer.
  const ptsBeforeDiff = size === "square";

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">Classement Starligue</p>
        {gameweekNumber !== null &&
          (gameweekNumber === 0 ? (
            <span className="pixel-corners-sm bg-accent-secondary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent-secondary">
              Avant J1
            </span>
          ) : (
            <p className="text-[10px] uppercase tracking-widest text-text-muted">Après J{gameweekNumber}</p>
          ))}
      </div>

      {standings.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-muted">Classement pas encore disponible.</p>
      ) : (
        <>
          {gameweekNumber === 0 && (
            <p className="mb-2 text-[11px] text-text-muted">
              La saison n'a pas encore commencé — classement à zéro partout, normal.
            </p>
          )}
          {size === "mini" ? (
            <div className="flex flex-col gap-2">
              {standings.map((s) => (
                <Link
                  key={s.clubId}
                  href={`/clubs/${s.clubId}`}
                  className="flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-text-muted">{s.rank}</span>
                  <ClubLogo club={{ shortName: s.clubShortName, name: s.clubName, logoUrl: s.logoUrl }} size="sm" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full border-collapse text-xs ${showDetailedColumns ? "min-w-[480px]" : "min-w-[200px]"}`}>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                    <th className="w-6 py-1 text-left font-normal">#</th>
                    <th className="py-1 text-left font-normal">Club</th>
                    {showDetailedColumns && (
                      <>
                        <th className="w-8 py-1 text-right font-normal">J</th>
                        <th className="w-8 py-1 text-right font-normal">V</th>
                        <th className="w-8 py-1 text-right font-normal">N</th>
                        <th className="w-8 py-1 text-right font-normal">D</th>
                        <th className="w-10 py-1 text-right font-normal">BP</th>
                        <th className="w-10 py-1 text-right font-normal">BC</th>
                      </>
                    )}
                    {ptsBeforeDiff ? (
                      <>
                        <th className="w-10 py-1 text-right font-semibold text-text">Pts</th>
                        <th className="w-10 py-1 text-right font-normal">Diff</th>
                      </>
                    ) : (
                      <>
                        <th className="w-10 py-1 text-right font-normal">Diff</th>
                        <th className="w-10 py-1 text-right font-semibold text-text">Pts</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s) => (
                    <tr key={s.clubId} className="border-t border-border/60">
                      <td className="py-1.5 text-text-muted tabular-nums">{s.rank}</td>
                      <td className="py-1.5">
                        <Link href={`/clubs/${s.clubId}`} className="flex items-center gap-1.5 hover:text-accent">
                          <ClubLogo club={{ shortName: s.clubShortName, name: s.clubName, logoUrl: s.logoUrl }} size="xs" />
                          <span className="truncate text-text">{s.clubShortName}</span>
                        </Link>
                      </td>
                      {showDetailedColumns && (
                        <>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.played}</td>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.wins}</td>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.draws}</td>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.losses}</td>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.goalsFor}</td>
                          <td className="py-1.5 text-right tabular-nums text-text-muted">{s.goalsAgainst}</td>
                        </>
                      )}
                      {(() => {
                        const diffCell = (
                          <td
                            className={`py-1.5 text-right tabular-nums ${
                              s.goalAvg > 0 ? "text-points-pos" : s.goalAvg < 0 ? "text-points-neg" : "text-text-muted"
                            }`}
                          >
                            {s.goalAvg > 0 ? `+${s.goalAvg}` : s.goalAvg}
                          </td>
                        );
                        const ptsCell = (
                          <td className="py-1.5 text-right font-semibold tabular-nums text-accent">{s.points}</td>
                        );
                        return ptsBeforeDiff ? (
                          <>
                            {ptsCell}
                            {diffCell}
                          </>
                        ) : (
                          <>
                            {diffCell}
                            {ptsCell}
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
