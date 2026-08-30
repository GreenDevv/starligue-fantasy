"use client";

import { useTranslations } from "next-intl";
import { countryFlag } from "@/lib/geo/countries";
import type { ClubFantasyRankingRow } from "@/lib/community/club-fantasy-ranking";
import type { WidgetSize } from "@/lib/dashboard/layout";

// Classement des clubs d'origine des managers par points fantasy cumulés. En tout
// début de saison tous les clubs sont à 0 — on l'affiche quand même (le tri se
// fait alors sur le nombre de managers puis le nom), c'est un teaser de la
// mécanique autant qu'un classement.
export function ClubFantasyRankingWidget({
  ranking,
  size = "square",
}: {
  ranking: ClubFantasyRankingRow[];
  size?: WidgetSize;
}) {
  const t = useTranslations("community");
  const limit = size === "mini" ? 5 : size === "square" ? 8 : 15;
  const rows = ranking.slice(0, limit);
  const allZero = ranking.every((r) => r.points === 0);

  return (
    <div className="pixel-corners flex h-full flex-col border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("clubRanking.title")}</p>
        {allZero && ranking.length > 0 && (
          <span className="pixel-corners-sm bg-accent-secondary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent-secondary">
            {t("clubRanking.seasonNotStarted")}
          </span>
        )}
      </div>

      {ranking.length === 0 ? (
        <p className="flex-1 py-6 text-center text-xs text-text-muted">{t("clubRanking.empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.clubId} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-text-muted">{r.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {r.clubCountry !== "FR" && `${countryFlag(r.clubCountry)} `}
                  {r.clubName}
                </p>
                <p className="truncate text-[10px] text-text-muted">
                  {[r.clubCity, t("clubRanking.managers", { count: r.managers })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{r.points}</span>
            </li>
          ))}
        </ul>
      )}

      {ranking.length > rows.length && (
        <p className="mt-1.5 text-[10px] text-text-muted">{t("clubRanking.more", { count: ranking.length - rows.length })}</p>
      )}
    </div>
  );
}
