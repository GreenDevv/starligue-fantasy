import { ClubLogo } from "@/components/ui/ClubLogo";
import type { ClubStandingsResult } from "@/lib/standings/get";

export function StandingsSection({ gameweekNumber, rows }: ClubStandingsResult) {
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">Classement</p>
        {gameweekNumber !== null && (
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Journée {gameweekNumber}</p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-muted">Classement pas encore disponible.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted">
                <th className="w-6 py-1 text-left font-normal">#</th>
                <th className="py-1 text-left font-normal">Club</th>
                <th className="w-8 py-1 text-right font-normal">J</th>
                <th className="w-10 py-1 text-right font-normal">+/-</th>
                <th className="w-8 py-1 text-right font-normal">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clubId} className="border-t border-border/60">
                  <td className="py-1.5 text-text-muted">{r.rank}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <ClubLogo club={{ shortName: r.clubShortName, name: r.clubName, logoUrl: r.logoUrl }} size="xs" />
                      <span className="truncate text-text">{r.clubShortName}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-text-muted">{r.played}</td>
                  <td className="py-1.5 text-right tabular-nums text-text-muted">
                    {r.goalAvg > 0 ? "+" : ""}
                    {r.goalAvg}
                  </td>
                  <td className="py-1.5 text-right font-arcade text-sm tabular-nums text-text">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
