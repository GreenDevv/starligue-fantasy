"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { countryFlag, countryName } from "@/lib/geo/countries";
import { groupOverseasByCountry, type HomeClubsAggregate } from "@/lib/community/home-clubs";
import type { WidgetSize } from "@/lib/dashboard/layout";
import { Skeleton } from "@/components/ui/Skeleton";

// Leaflet touche `window` au chargement du module → carte chargée uniquement
// côté client, jamais pendant le SSR de ce widget.
const HomeClubsLeafletMap = dynamic(
  () => import("./HomeClubsLeafletMap").then((m) => m.HomeClubsLeafletMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

const HEIGHT_BY_SIZE: Record<WidgetSize, number> = { mini: 200, square: 320, wide: 420 };

export function HomeClubsMapWidget({
  aggregate,
  locale,
  size = "square",
}: {
  aggregate: HomeClubsAggregate;
  locale: string;
  size?: WidgetSize;
}) {
  const t = useTranslations("community");
  const { totals, points, unlocated } = aggregate;
  const countryLegend = groupOverseasByCountry(points);

  const dotLabel = useCallback((count: number) => t("homeMap.dotTitle", { count }), [t]);

  return (
    <div className="pixel-corners flex h-full flex-col border border-border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("homeMap.title")}</p>

      {totals.members === 0 ? (
        <p className="flex-1 py-6 text-center text-xs text-text-muted">{t("homeMap.empty")}</p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-text-muted">
            {t("homeMap.summary", {
              members: totals.members,
              clubs: totals.clubs,
              departments: totals.departments,
            })}
          </p>

          <div className="mt-2" style={{ height: HEIGHT_BY_SIZE[size] }}>
            <HomeClubsLeafletMap points={points} dotLabel={dotLabel} height={HEIGHT_BY_SIZE[size]} />
          </div>

          {(countryLegend.length > 0 || unlocated > 0) && (
            <div className="mt-3">
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted">{t("homeMap.alsoRepresented")}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text">
                {countryLegend.map((g) => (
                  <li key={g.country} className="flex items-center gap-1">
                    <span>
                      {g.country === "FR" ? t("homeMap.overseas") : `${countryFlag(g.country)} ${countryName(g.country, locale)}`}
                    </span>
                    <span className="tabular-nums text-text-muted">{g.count}</span>
                  </li>
                ))}
                {unlocated > 0 && (
                  <li className="flex items-center gap-1 text-text-muted">
                    <span>{t("homeMap.unlocated")}</span>
                    <span className="tabular-nums">{unlocated}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
