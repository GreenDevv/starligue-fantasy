"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ClubLogo } from "@/components/ui/ClubLogo";

// Graphique SVG à la main (même convention que ValueHistoryChart — pas de
// dépendance ajoutée), multi-séries générique : abscisse = journées de
// championnat, ordonnée = valeur d'un compteur. Extrait de PlayerStatsChart
// pour être réutilisé tel quel par ClubGoalsChart (buts marqués/encaissés) —
// même interaction (puces-légende toujours visibles = coche + légende, jamais
// la seule couleur ne porte l'identité, voir skill dataviz).
const SURFACE = "#171C24";
const BORDER = "#262D38";
const TEXT_MUTED = "#94A3B8";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface ChartOpponent {
  shortName: string;
  name?: string;
  logoUrl?: string | null;
}

export interface ChartGameweekEntry {
  gameweekNumber: number;
  values: Record<string, number>;
  opponent?: ChartOpponent;
}

const VIEW_W = 600;
const VIEW_H = 220;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

export function MultiSeriesLineChart({
  series,
  entries,
  defaultActiveKeys,
  emptyMessage,
  primaryLabel,
  compareEntries,
  compareLabel,
}: {
  series: ChartSeries[];
  entries: ChartGameweekEntry[];
  defaultActiveKeys?: string[];
  emptyMessage?: string;
  // Label du joueur/club "principal", affiché dans la tooltip seulement en mode
  // comparaison (sinon la tooltip reste sans en-tête de série, comme avant).
  primaryLabel?: string;
  // Second jeu de données superposé (comparaison de joueurs) — même unité/mêmes
  // séries, tracé en pointillé, aligné sur le numéro de journée (pas l'index :
  // les deux joueurs peuvent avoir des journées manquantes différentes, ex.
  // blessure/transfert).
  compareEntries?: ChartGameweekEntry[];
  compareLabel?: string;
}) {
  const t = useTranslations("matches");
  const resolvedEmptyMessage = emptyMessage ?? t("charts.emptyDefault");
  const resolvedPrimaryLabel = primaryLabel ?? t("charts.thisPlayer");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverGw, setHoverGw] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>(
    defaultActiveKeys
      ? series.filter((l) => defaultActiveKeys.includes(l.key)).map((l) => l.key)
      : series.map((l) => l.key)
  );

  function toggleKey(key: string) {
    setActiveKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Union des journées présentes chez l'un OU l'autre joueur, triée — l'abscisse
  // est indexée sur cette liste plutôt que sur l'index brut d'un tableau, pour que
  // les deux séries restent alignées journée par journée même si l'une a moins de
  // points que l'autre.
  const allGameweeks = Array.from(
    new Set([...entries.map((e) => e.gameweekNumber), ...(compareEntries ?? []).map((e) => e.gameweekNumber)])
  ).sort((a, b) => a - b);

  if (allGameweeks.length === 0) {
    return <p className="py-6 text-center text-xs text-text-muted">{resolvedEmptyMessage}</p>;
  }

  const activeLines = series.filter((l) => activeKeys.includes(l.key));

  const datasets = compareEntries ? [entries, compareEntries] : [entries];
  const allValues = datasets.flatMap((ds) => ds.flatMap((e) => activeLines.map((l) => e.values[l.key] ?? 0)));
  // minValue plafonné à 0 : les séries habituelles (buts, stats) restent 0-based
  // comme avant ; une série qui descend sous 0 (ex. apport des pronostics) étend
  // le domaine plutôt que d'être coupée en bas du graphique.
  const maxValue = Math.max(1, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const valueRange = maxValue - minValue || 1;

  const x = (gw: number) => {
    if (allGameweeks.length === 1) return PAD_LEFT + PLOT_W / 2;
    const idx = allGameweeks.indexOf(gw);
    return PAD_LEFT + (idx / (allGameweeks.length - 1)) * PLOT_W;
  };
  const y = (v: number) => PAD_TOP + (1 - (v - minValue) / valueRange) * PLOT_H;

  const gridLines = Array.from(new Set([minValue, Math.round((minValue + maxValue) / 2), maxValue]));
  const labelEvery = Math.max(1, Math.ceil(allGameweeks.length / 10));

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = allGameweeks[0]!;
    let nearestDist = Infinity;
    allGameweeks.forEach((gw) => {
      const d = Math.abs(x(gw) - relX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = gw;
      }
    });
    setHoverGw(nearest);
  }

  const hoveredPrimary = hoverGw !== null ? entries.find((e) => e.gameweekNumber === hoverGw) : null;
  const hoveredCompare =
    hoverGw !== null ? (compareEntries ?? []).find((e) => e.gameweekNumber === hoverGw) : null;
  const isComparing = Boolean(compareEntries);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {series.map((line) => {
          const active = activeKeys.includes(line.key);
          return (
            <button
              key={line.key}
              type="button"
              onClick={() => toggleKey(line.key)}
              aria-pressed={active}
              className={`pixel-corners-sm flex items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors ${
                active ? "border-transparent text-text" : "border-border text-text-muted hover:text-text"
              }`}
              style={active ? { backgroundColor: `${line.color}26`, borderColor: line.color } : undefined}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? line.color : TEXT_MUTED }}
              />
              {line.label}
            </button>
          );
        })}
      </div>

      {isComparing && (
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 bg-text-muted" />
            {resolvedPrimaryLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 shrink-0"
              style={{ backgroundImage: `repeating-linear-gradient(90deg, ${TEXT_MUTED} 0 4px, transparent 4px 7px)` }}
            />
            {compareLabel}
          </span>
        </div>
      )}

      {activeLines.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">{t("charts.selectAtLeastOne")}</p>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full touch-none"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverGw(null)}
          >
            {/* Grille discrète */}
            {gridLines.map((v, i) => (
              <g key={i}>
                <line x1={PAD_LEFT} x2={VIEW_W - PAD_RIGHT} y1={y(v)} y2={y(v)} stroke={BORDER} strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
                  {v}
                </text>
              </g>
            ))}

            {/* Axe des journées */}
            {allGameweeks.map((gw, i) =>
              i % labelEvery === 0 || i === allGameweeks.length - 1 ? (
                <text key={gw} x={x(gw)} y={VIEW_H - PAD_BOTTOM + 14} textAnchor="middle" fontSize={9} fill={TEXT_MUTED}>
                  {t("charts.gameweekAxis", { number: gw })}
                </text>
              ) : null
            )}

            {/* Une ligne par série active, et par joueur si comparaison */}
            {activeLines.map((line) => {
              const points = entries.map((e) => ({ x: x(e.gameweekNumber), y: y(e.values[line.key] ?? 0) }));
              const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

              const comparePoints = compareEntries?.map((e) => ({ x: x(e.gameweekNumber), y: y(e.values[line.key] ?? 0) }));
              const comparePath = comparePoints
                ?.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(" ");

              return (
                <g key={line.key}>
                  {/* Fondu plutôt que tracé progressif (pathLength) : sur les séries
                      à beaucoup de points, l'effet pathLength de Framer Motion ne
                      nettoie pas toujours son stroke-dasharray interne en fin
                      d'animation (bug connu, https://github.com/framer/motion/issues/1605)
                      — la ligne restait visuellement coupée avant la fin pendant que
                      les points (animés séparément) continuaient d'apparaître,
                      donnant des puces isolées non reliées. Le fondu n'a pas ce
                      risque. */}
                  <motion.path
                    d={path}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={line.dashed ? "5 3" : undefined}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                  {points.map((p, i) => (
                    <motion.circle
                      key={`p-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={entries[i]?.gameweekNumber === hoverGw ? 3.5 : 2}
                      fill={entries[i]?.gameweekNumber === hoverGw ? line.color : SURFACE}
                      stroke={line.color}
                      strokeWidth={1.5}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: 0.5 + i * 0.01 }}
                    />
                  ))}

                  {/* Série du joueur comparé — toujours en pointillé, opacité
                      réduite, pour rester secondaire visuellement à la couleur qui
                      porte l'identité de la STAT (pas du joueur). */}
                  {comparePoints && comparePath && (
                    <>
                      <motion.path
                        d={comparePath}
                        fill="none"
                        stroke={line.color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity={0.55}
                        strokeDasharray="4 3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                      {comparePoints.map((p, i) => (
                        <motion.circle
                          key={`c-${i}`}
                          cx={p.x}
                          cy={p.y}
                          r={compareEntries![i]?.gameweekNumber === hoverGw ? 3.5 : 2}
                          fill={SURFACE}
                          stroke={line.color}
                          strokeOpacity={0.55}
                          strokeWidth={1.5}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, delay: 0.5 + i * 0.01 }}
                        />
                      ))}
                    </>
                  )}
                </g>
              );
            })}

            {/* Repère de survol */}
            {hoverGw !== null && (
              <line
                x1={x(hoverGw)}
                x2={x(hoverGw)}
                y1={PAD_TOP}
                y2={VIEW_H - PAD_BOTTOM}
                stroke={TEXT_MUTED}
                strokeWidth={1}
                strokeOpacity={0.35}
              />
            )}
          </svg>

          {hoverGw !== null && (hoveredPrimary || hoveredCompare) && (
            <div
              // z-30 : au-dessus de la nav du bas (z-20, fixed) et de la nav du haut
              // (z-10, sticky) — la tooltip est en position absolute dans le flux de
              // la page et se faisait recouvrir par ces barres fixes quand le
              // graphique était en bas de viewport (mobile).
              className="pixel-corners-sm pointer-events-none absolute top-0 z-30 -translate-x-1/2 border border-border bg-bg px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{
                left: `${(x(hoverGw) / VIEW_W) * 100}%`,
                maxWidth: "180px",
              }}
            >
              <p className="mb-1 font-semibold text-text">{t("charts.gameweekTooltip", { number: hoverGw })}</p>

              {hoveredPrimary?.opponent && (
                <div className="mb-1 flex items-center gap-1.5 text-text-muted">
                  <ClubLogo club={hoveredPrimary.opponent} size="xs" />
                  <span className="truncate">
                    {isComparing && primaryLabel ? `${primaryLabel} ${t("vs")} ` : `${t("vs")} `}
                    {hoveredPrimary.opponent.shortName}
                  </span>
                </div>
              )}
              {isComparing && hoveredCompare?.opponent && (
                <div className="mb-1 flex items-center gap-1.5 text-text-muted">
                  <ClubLogo club={hoveredCompare.opponent} size="xs" />
                  <span className="truncate">
                    {compareLabel} {t("vs")} {hoveredCompare.opponent.shortName}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {activeLines.map((line) => (
                  <div key={line.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-text-muted">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                      {line.label}
                    </span>
                    <span className="font-medium tabular-nums text-text">
                      {hoveredPrimary?.values[line.key] ?? (isComparing ? "—" : 0)}
                      {isComparing && (
                        <span className="ml-1 text-text-muted">/ {hoveredCompare?.values[line.key] ?? "—"}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
