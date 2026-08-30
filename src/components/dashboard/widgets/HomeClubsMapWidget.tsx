"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { makeFranceProjector, METRO_FRANCE_RING, CORSICA_RING, METRO_FRANCE_BOUNDS } from "@/lib/geo/france-map";
import { WORLD_LAND_RINGS } from "@/lib/geo/world-map";
import {
  makeEquirectProjector,
  boundsOfPoints,
  padBounds,
  unionBounds,
  clampBounds,
  WORLD_BOUNDS,
} from "@/lib/geo/map-projection";
import { countryFlag, countryName } from "@/lib/geo/countries";
import { groupOverseasByCountry, type DepartmentClub, type HomeClubsAggregate } from "@/lib/community/home-clubs";
import type { WidgetSize } from "@/lib/dashboard/layout";

const W = 320;

// Rayon d'un point : racine du nombre de managers (aire ∝ count), borné pour
// rester lisible même à fort effectif.
function dotRadius(count: number): number {
  return Math.min(3 + Math.sqrt(count) * 2.4, 16);
}

interface MapDot {
  key: string;
  lon: number;
  lat: number;
  count: number;
  clubs: DepartmentClub[];
}

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
  const tipId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { totals, metropolitan, overseas, unlocated } = aggregate;

  const worldMode = overseas.length > 0;
  const H = worldMode ? 170 : 320;

  const dots: MapDot[] = useMemo(
    () => [
      ...metropolitan.map((d) => ({ key: `d-${d.dept}`, lon: d.lon, lat: d.lat, count: d.count, clubs: d.clubs })),
      ...overseas.map((p) => ({
        key: `o-${p.clubId}`,
        lon: p.lon,
        lat: p.lat,
        count: p.count,
        clubs: [{ name: p.name, city: p.city, count: p.count }],
      })),
    ],
    [metropolitan, overseas],
  );

  const { proj, outline } = useMemo(() => {
    if (!worldMode) {
      const p = makeFranceProjector(W, H);
      return { proj: p, outline: `${p.ringPath(METRO_FRANCE_RING)} ${p.ringPath(CORSICA_RING)}` };
    }
    const fit = boundsOfPoints(dots.map((d) => ({ lon: d.lon, lat: d.lat }))) ?? METRO_FRANCE_BOUNDS;
    // France toujours dans le cadre (identité du jeu), marge 15 %, jamais plus
    // serré que ~20°×15°, jamais plus large que le monde.
    const bounds = clampBounds(padBounds(unionBounds(fit, METRO_FRANCE_BOUNDS), 0.15, 20, 15), WORLD_BOUNDS);
    const p = makeEquirectProjector(bounds, W, H);
    return { proj: p, outline: WORLD_LAND_RINGS.map((r) => p.ringPath(r)).join(" ") };
  }, [worldMode, H, dots]);

  const countryLegend = worldMode ? groupOverseasByCountry(overseas) : [];
  const active = dots.find((d) => d.key === activeKey) ?? null;

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

          <div className="relative mx-auto mt-2 w-full max-w-[300px]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("homeMap.title")}>
              <path
                d={outline}
                className="fill-bg stroke-border"
                strokeWidth={worldMode ? 0.6 : 1}
                fillRule="evenodd"
              />
              {dots.map((d) => {
                const { x, y } = proj.project(d.lon, d.lat);
                const isActive = d.key === activeKey;
                return (
                  <circle
                    key={d.key}
                    cx={x}
                    cy={y}
                    r={dotRadius(d.count)}
                    className={`cursor-pointer transition-colors ${
                      isActive ? "fill-accent stroke-accent" : "fill-accent/60 stroke-accent"
                    }`}
                    strokeWidth={isActive ? 2 : 1}
                    tabIndex={0}
                    role="button"
                    aria-describedby={isActive ? tipId : undefined}
                    onMouseEnter={() => setActiveKey(d.key)}
                    onMouseLeave={() => setActiveKey((cur) => (cur === d.key ? null : cur))}
                    onFocus={() => setActiveKey(d.key)}
                    onBlur={() => setActiveKey((cur) => (cur === d.key ? null : cur))}
                    onClick={() => setActiveKey((cur) => (cur === d.key ? null : d.key))}
                  >
                    <title>{t("homeMap.dotTitle", { count: d.count })}</title>
                  </circle>
                );
              })}
            </svg>

            {active &&
              (() => {
                const { x, y } = proj.project(active.lon, active.lat);
                const xFrac = x / W;
                const yFrac = y / H;
                const tx = xFrac < 0.25 ? "0%" : xFrac > 0.75 ? "-100%" : "-50%";
                const ty = yFrac < 0.5 ? "0.5rem" : "calc(-100% - 0.5rem)";
                return (
                  <div
                    id={tipId}
                    role="tooltip"
                    className="pointer-events-none absolute z-10 w-max max-w-[170px] rounded border border-accent/50 bg-bg/95 px-2 py-1.5 text-left shadow-lg"
                    style={{ left: `${xFrac * 100}%`, top: `${yFrac * 100}%`, transform: `translate(${tx}, ${ty})` }}
                  >
                    <ul className="flex flex-col gap-0.5">
                      {active.clubs.map((c) => (
                        <li key={c.name} className="text-[11px] leading-tight text-text">
                          <span className="font-medium">{c.name}</span>
                          {c.city ? <span className="text-text-muted"> · {c.city}</span> : null}
                          {c.count > 1 ? <span className="text-accent"> ×{c.count}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
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
