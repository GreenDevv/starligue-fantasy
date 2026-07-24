"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

// Graphique SVG à la main (pas de dépendance ajoutée — même convention que
// HandballPitch/Jersey). Skill dataviz consultée : couleur ambre déjà utilisée
// pour "valeur" partout dans l'app plutôt qu'une nouvelle couleur ; en mode
// comparaison, le second joueur reste ambre aussi (c'est la même métrique) mais
// en pointillé/opacité réduite — l'identité "quel joueur" est portée par le trait,
// pas par une 2e teinte. Couleurs en hex bruts (le SVG ne lit pas les classes
// Tailwind, mêmes valeurs que tailwind.config.ts).
const AMBER = "#F59E0B";
const SURFACE = "#171C24";
const BORDER = "#262D38";
const TEXT_MUTED = "#94A3B8";

export interface ValueHistoryPoint {
  value: number;
  gameweekNumber: number | null; // null = valorisation pré-saison
}

const VIEW_W = 320;
const VIEW_H = 130;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PAD_TOP = 20;
const PAD_BOTTOM = 22;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

// null (pré-saison) trié avant toute journée numérotée.
const sortKey = (gw: number | null) => gw ?? -1;

export function ValueHistoryChart({
  entries,
  primaryLabel,
  compareEntries,
  compareLabel,
}: {
  entries: ValueHistoryPoint[];
  primaryLabel?: string;
  compareEntries?: ValueHistoryPoint[];
  compareLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverKey, setHoverKey] = useState<number | null>(null);
  const isComparing = Boolean(compareEntries);

  // Union des journées (pré-saison incluse) présentes chez l'un OU l'autre joueur,
  // pour garder les deux séries alignées journée par journée même si l'une a moins
  // de points que l'autre (ex. joueur arrivé en cours de saison).
  const allKeys = Array.from(
    new Set([...entries.map((e) => sortKey(e.gameweekNumber)), ...(compareEntries ?? []).map((e) => sortKey(e.gameweekNumber))])
  ).sort((a, b) => a - b);

  if (allKeys.length === 0) {
    return <p className="py-6 text-center text-xs text-text-muted">Pas encore de valorisation.</p>;
  }
  if (allKeys.length === 1 && !isComparing) {
    return (
      <p className="py-6 text-center text-xs text-text-muted">
        Valeur initiale : {entries[0]!.value.toFixed(1)}M — pas encore d'historique de variation.
      </p>
    );
  }

  const allValues = [...entries, ...(compareEntries ?? [])].map((e) => e.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  const x = (gw: number) => {
    if (allKeys.length === 1) return PAD_LEFT + PLOT_W / 2;
    const idx = allKeys.indexOf(gw);
    return PAD_LEFT + (idx / (allKeys.length - 1)) * PLOT_W;
  };
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * PLOT_H;

  const points = entries.map((e) => ({ ...e, x: x(sortKey(e.gameweekNumber)), y: y(e.value) }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1] ?? null;

  const comparePoints = compareEntries?.map((e) => ({ ...e, x: x(sortKey(e.gameweekNumber)), y: y(e.value) }));
  const comparePath = comparePoints?.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lastCompare = comparePoints && comparePoints.length > 0 ? comparePoints[comparePoints.length - 1]! : null;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = allKeys[0]!;
    let nearestDist = Infinity;
    allKeys.forEach((gw) => {
      const d = Math.abs(x(gw) - relX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = gw;
      }
    });
    setHoverKey(nearest);
  }

  const hoveredPrimary = hoverKey !== null ? points.find((p) => sortKey(p.gameweekNumber) === hoverKey) : null;
  const hoveredCompare = hoverKey !== null ? comparePoints?.find((p) => sortKey(p.gameweekNumber) === hoverKey) : null;
  const hoverX = hoverKey !== null ? x(hoverKey) : null;

  const gridLines = [min, (min + max) / 2, max];

  return (
    <div className="flex flex-col gap-2">
      {isComparing && (
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0" style={{ backgroundColor: AMBER }} />
            {primaryLabel ?? "Ce joueur"}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 shrink-0"
              style={{ backgroundImage: `repeating-linear-gradient(90deg, ${AMBER} 0 4px, transparent 4px 7px)`, opacity: 0.55 }}
            />
            {compareLabel}
          </span>
        </div>
      )}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full touch-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverKey(null)}
        >
          {/* Grille discrète */}
          {gridLines.map((v, i) => (
            <g key={i}>
              <line x1={PAD_LEFT} x2={VIEW_W - PAD_RIGHT} y1={y(v)} y2={y(v)} stroke={BORDER} strokeWidth={1} />
              <text x={PAD_LEFT - 4} y={y(v) + 3} textAnchor="end" fontSize={8} fill={TEXT_MUTED}>
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Fondu plutôt que tracé progressif (pathLength) : sur les historiques à
              beaucoup de points, l'effet pathLength de Framer Motion ne nettoie pas
              toujours son stroke-dasharray interne en fin d'animation (bug connu,
              https://github.com/framer/motion/issues/1605) — la ligne restait
              visuellement coupée avant la fin pendant que les points (animés
              séparément) continuaient d'apparaître, donnant des puces isolées non
              reliées. Le fondu n'a pas ce risque. */}
          <motion.path
            d={path}
            fill="none"
            stroke={AMBER}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />

          {/* Points */}
          {points.map((p, i) => (
            <motion.circle
              key={`p-${i}`}
              cx={p.x}
              cy={p.y}
              r={sortKey(p.gameweekNumber) === hoverKey ? 4 : 2.5}
              fill={i === points.length - 1 ? AMBER : SURFACE}
              stroke={AMBER}
              strokeWidth={1.5}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.5 + i * 0.015 }}
            />
          ))}

          {last && (
            <motion.text
              x={last.x}
              y={last.y - 8}
              textAnchor="end"
              fontSize={9}
              fontWeight={600}
              fill={AMBER}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.7 }}
            >
              {last.value.toFixed(1)}M
            </motion.text>
          )}

          {/* Série du joueur comparé — pointillé, opacité réduite. */}
          {comparePoints && comparePath && (
            <>
              <motion.path
                d={comparePath}
                fill="none"
                stroke={AMBER}
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
                  r={sortKey(p.gameweekNumber) === hoverKey ? 4 : 2.5}
                  fill={SURFACE}
                  stroke={AMBER}
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.5 + i * 0.015 }}
                />
              ))}
              {lastCompare && (
                <motion.text
                  x={lastCompare.x}
                  y={lastCompare.y - 8}
                  textAnchor="start"
                  fontSize={9}
                  fontWeight={600}
                  fill={AMBER}
                  fillOpacity={0.7}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.7 }}
                >
                  {lastCompare.value.toFixed(1)}M
                </motion.text>
              )}
            </>
          )}

          {/* Repère de survol */}
          {hoverX !== null && (
            <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={VIEW_H - PAD_BOTTOM} stroke={AMBER} strokeWidth={1} strokeOpacity={0.35} />
          )}
        </svg>

        {hoverKey !== null && (hoveredPrimary || hoveredCompare) && (
          <div
            // z-30 : au-dessus de la nav du bas (z-20, fixed) et de la nav du haut
            // (z-10, sticky) — la tooltip est en position absolute dans le flux de
            // la page et se faisait recouvrir par ces barres fixes quand le
            // graphique était en bas de viewport (mobile).
            className="pixel-corners-sm pointer-events-none absolute top-0 z-30 -translate-x-1/2 border border-accent-secondary/40 bg-bg px-2 py-1 text-[10px] text-text shadow-lg"
            style={{ left: `${(hoverX! / VIEW_W) * 100}%` }}
          >
            {hoveredPrimary && (
              <p className="font-semibold text-accent-secondary">
                {isComparing && primaryLabel ? `${primaryLabel} : ` : ""}
                {hoveredPrimary.value.toFixed(1)}M
              </p>
            )}
            {isComparing && hoveredCompare && (
              <p className="font-semibold text-accent-secondary/70">
                {compareLabel} : {hoveredCompare.value.toFixed(1)}M
              </p>
            )}
            <p className="text-text-muted">{hoverKey === -1 ? "Pré-saison" : `Journée ${hoverKey}`}</p>
          </div>
        )}
      </div>
    </div>
  );
}
