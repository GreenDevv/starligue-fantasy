"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { makeFranceProjector, METRO_FRANCE_RING, CORSICA_RING } from "@/lib/geo/france-map";
import { countryFlag } from "@/lib/geo/countries";
import {
  abroadLabel,
  type DepartmentPoint,
  type HomeClubsAggregate,
} from "@/lib/community/home-clubs";
import type { WidgetSize } from "@/lib/dashboard/layout";

const W = 320;
const H = 320;

// Rayon d'un point de département : racine du nombre de managers (aire ∝ count),
// borné pour rester lisible même à fort effectif.
function dotRadius(count: number): number {
  return Math.min(3 + Math.sqrt(count) * 2.4, 16);
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
  const [active, setActive] = useState<DepartmentPoint | null>(null);
  const { totals, metropolitan, abroad, unlocated } = aggregate;

  const proj = makeFranceProjector(W, H);
  const outline = `${proj.ringPath(METRO_FRANCE_RING)} ${proj.ringPath(CORSICA_RING)}`;
  const hasSidePanel = size !== "mini" && (abroad.length > 0 || unlocated > 0);

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

          <div className={hasSidePanel ? "mt-2 flex flex-col gap-3 sm:flex-row sm:items-start" : "mt-2"}>
            <div className="relative mx-auto w-full max-w-[260px] shrink-0">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label={t("homeMap.title")}
              >
                <path d={outline} className="fill-bg stroke-border" strokeWidth={1} />
                {metropolitan.map((d) => {
                  const { x, y } = proj.project(d.lon, d.lat);
                  const isActive = active?.dept === d.dept;
                  return (
                    <circle
                      key={d.dept}
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
                      onMouseEnter={() => setActive(d)}
                      onMouseLeave={() => setActive((cur) => (cur?.dept === d.dept ? null : cur))}
                      onFocus={() => setActive(d)}
                      onBlur={() => setActive((cur) => (cur?.dept === d.dept ? null : cur))}
                      onClick={() => setActive((cur) => (cur?.dept === d.dept ? null : d))}
                    >
                      <title>{t("homeMap.dotTitle", { count: d.count })}</title>
                    </circle>
                  );
                })}
              </svg>

              {active &&
                (() => {
                  const { x, y } = proj.project(active.lon, active.lat);
                  const yFrac = y / H;
                  // Bascule haut/bas selon la moitié où tombe le point, pour que
                  // le tooltip reste dans la carte. Idem gauche/droite près des bords.
                  const below = yFrac < 0.5;
                  const xFrac = x / W;
                  const tx = xFrac < 0.25 ? "0%" : xFrac > 0.75 ? "-100%" : "-50%";
                  const ty = below ? "0.5rem" : "calc(-100% - 0.5rem)";
                  return (
                    <div
                      id={tipId}
                      role="tooltip"
                      className="pointer-events-none absolute z-10 w-max max-w-[160px] rounded border border-accent/50 bg-bg/95 px-2 py-1.5 text-left shadow-lg"
                      style={{
                        left: `${xFrac * 100}%`,
                        top: `${yFrac * 100}%`,
                        transform: `translate(${tx}, ${ty})`,
                      }}
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

            {hasSidePanel && (
              <div className="min-w-0 flex-1">
                <h3 className="text-[10px] uppercase tracking-widest text-text-muted">{t("homeMap.alsoRepresented")}</h3>
                <ul className="mt-1.5 flex flex-col gap-1 text-xs text-text">
                  {abroad.map((g) => (
                    <li key={g.key} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {g.key !== "OUTRE_MER" && `${countryFlag(g.key)} `}
                        {abroadLabel(g.key, locale, t("homeMap.overseas"))}
                      </span>
                      <span className="shrink-0 tabular-nums text-text-muted">{g.count}</span>
                    </li>
                  ))}
                  {unlocated > 0 && (
                    <li className="flex items-center justify-between gap-3 text-text-muted">
                      <span>{t("homeMap.unlocated")}</span>
                      <span className="shrink-0 tabular-nums">{unlocated}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
