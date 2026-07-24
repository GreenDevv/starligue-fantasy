// Rendu SVG du maillot personnalisable — mêmes conventions que
// src/components/pitch/HandballPitch.tsx : viewBox fixe mis à l'échelle via CSS
// (jamais width/height), couleurs en hex bruts (le SVG ne lit pas les classes
// Tailwind), <defs> pour la silhouette réutilisée en clipPath. Les régions de
// motif viennent du registre partagé src/lib/team/kitPatterns.ts, seule
// source de vérité aussi utilisée par la texture Canvas du viewer 3D.
import { safeJerseyConfig, zoneColor, zonePattern, type JerseyConfig } from "@/lib/team/jersey";
import { JERSEY_SLEEVE_RIGHT, KIT_SILHOUETTES, silhouetteToSvgPath } from "@/lib/team/kitSilhouettes";

interface JerseyProps {
  config: unknown;
  view?: "front" | "back";
  className?: string;
}

// Silhouette torse + manches courtes + encolure — partagée avec KitViewer3D
// via src/lib/team/kitSilhouettes.ts, réutilisée ici pour le remplissage de
// base et comme clip pour les calques de motif/manches.
const BODY_PATH = silhouetteToSvgPath(KIT_SILHOUETTES.jersey);

function PatternLayer({ config, clipId }: { config: JerseyConfig; clipId: string }) {
  const zone = config.jersey;
  const overlays = zonePattern(zone).regions.filter((r) => r.slot > 0);
  if (overlays.length === 0) return null;

  return (
    <g clipPath={`url(#${clipId})`}>
      {overlays.map((region, i) => (
        <polygon
          key={i}
          points={region.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={zoneColor(zone, region.slot)}
        />
      ))}
    </g>
  );
}

const SLEEVE_RIGHT_POINTS = JERSEY_SLEEVE_RIGHT.map(([x, y]) => `${x},${y}`).join(" ");
const SLEEVE_LEFT_POINTS = JERSEY_SLEEVE_RIGHT.map(([x, y]) => `${100 - x},${y}`).join(" ");

function SleeveLayer({ config, clipId }: { config: JerseyConfig; clipId: string }) {
  if (!config.contrastSleeves) return null;
  return (
    <g clipPath={`url(#${clipId})`}>
      <polygon points={SLEEVE_RIGHT_POINTS} fill={config.trimColor} />
      <polygon points={SLEEVE_LEFT_POINTS} fill={config.trimColor} />
    </g>
  );
}

function Collar({ config }: { config: JerseyConfig }) {
  const { collar, trimColor } = config;
  if (collar === "v-neck") {
    return (
      <path
        d="M40,12.5 L50,24 L60,12.5"
        fill="none"
        stroke={trimColor}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    );
  }
  if (collar === "polo") {
    return (
      <>
        <rect x={46} y={11} width={8} height={15} fill={trimColor} />
        <circle cx={50} cy={16} r={1.2} fill="#0006" />
        <circle cx={50} cy={21} r={1.2} fill="#0006" />
      </>
    );
  }
  // crew
  return (
    <path d="M37,12 Q50,25 63,12" fill="none" stroke={trimColor} strokeWidth={3.5} />
  );
}

export function Jersey({ config, view = "front", className = "" }: JerseyProps) {
  const cfg = safeJerseyConfig(config);
  const clipId = `jersey-clip-${view}`;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <path id={`jersey-body-${view}`} d={BODY_PATH} />
        <clipPath id={clipId}>
          <use href={`#jersey-body-${view}`} />
        </clipPath>
      </defs>

      <use href={`#jersey-body-${view}`} fill={zoneColor(cfg.jersey, 0)} stroke="#00000040" strokeWidth={1} />
      <PatternLayer config={cfg} clipId={clipId} />
      <SleeveLayer config={cfg} clipId={clipId} />

      {view === "front" ? (
        <>
          <Collar config={cfg} />
          <text
            x={50}
            y={60}
            textAnchor="middle"
            fill="#00000055"
            fontSize={16}
            fontWeight={700}
            style={{ fontFamily: "var(--font-arcade), monospace" }}
          >
            {cfg.number}
          </text>
        </>
      ) : (
        <>
          {cfg.nameFlock && (
            <text
              x={50}
              y={28}
              textAnchor="middle"
              fill="#00000070"
              fontSize={8}
              fontWeight={700}
              letterSpacing={0.5}
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {cfg.nameFlock.toUpperCase()}
            </text>
          )}
          <text
            x={50}
            y={62}
            textAnchor="middle"
            fill="#00000070"
            fontSize={32}
            fontWeight={700}
            style={{ fontFamily: "var(--font-arcade), monospace" }}
          >
            {cfg.number}
          </text>
        </>
      )}
    </svg>
  );
}
