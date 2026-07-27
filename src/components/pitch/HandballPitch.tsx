"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { initials } from "@/components/ui/positionTheme";

interface PitchPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  photoUrl?: string | null;
  photoOffsetX?: number;
  photoOffsetY?: number;
  photoZoom?: number;
  club: { shortName: string; logoUrl?: string | null };
  role: "STARTER" | "BENCH";
  points?: number;
}

interface HandballPitchProps {
  starters: PitchPlayer[];
  bench: PitchPlayer[];
  captainId?: string | null;
  onSwap?: (playerId: string) => void;
  onEmptySlotClick?: (position: Position) => void;
  benchLabel?: string;
}

// Demi-terrain réel : 20m (ligne médiane → ligne de but) × 20m (largeur), échelle
// 10px/m. Formation en losange : ailiers proches de la ligne de but côté touche,
// arrières sur la ligne des 9m, pivot au ras des 6m, gardien dans le but.
// La vue est cadrée sur la zone effectivement utilisée par les 7 postes (pas le
// terrain entier jusqu'à la ligne médiane, qui resterait vide à l'écran).
//
// Le terrain occupe TOUTE la largeur du conteneur (le banc est en dessous, pas à
// côté — cf. ARCHITECTURE.md §8.1, "banc horizontal en dessous") : c'est ce qui
// donne assez d'échelle réelle en pixels pour que noms + logos de club restent
// lisibles sur mobile, contrairement à l'ancien layout terrain+banc côte à côte.
const COURT = 200; // 20m de large × 20m de profondeur
const GOAL_DEPTH = 16; // débord visuel du but sous la ligne (hors terrain de jeu)
const VIEW_TOP = 62; // recadrage : commence juste au-dessus du demi-centre
const BOTTOM_PAD = 4; // marge sous le gardien pour que son nom ne touche pas le bord
const VIEW_HEIGHT = COURT + GOAL_DEPTH - VIEW_TOP + BOTTOM_PAD;

const R = 12; // rayon de l'avatar joueur
const RING_R = 13.5; // rayon du halo coloré derrière l'avatar

// Coordonnées calibrées à la main via l'éditeur interactif (glisser-déposer +
// détection de chevauchement en direct, cf. session) — formation resserrée
// mais vérifiée sans aucun contact entre jetons.
const SLOT_COORDS: Record<Position, { x: number; y: number }> = {
  GK: { x: 100.9, y: 174.7 },
  PV: { x: 100.3, y: 127.5 },
  LB: { x: 165.4, y: 93 },
  CB: { x: 99.2, y: 82.8 },
  RB: { x: 35.6, y: 95.2 },
  LW: { x: 169.1, y: 151 },
  RW: { x: 29, y: 154.5 },
};

// Taille de police du nom sur le terrain, réduite pour les noms longs plutôt que
// tronquée — on ne coupe jamais le texte, on l'adapte.
function nameFontSize(name: string): number {
  if (name.length > 14) return 7;
  if (name.length > 10) return 8;
  return 9;
}

// Anneau coloré par poste — cohérent avec POSITION_THEME (ui/positionTheme.ts),
// converti en hex car le SVG brut ne lit pas les classes Tailwind.
const RING_HEX: Record<Position, string> = {
  GK: "#2DD4BF",
  LW: "#F59E0B",
  RW: "#F59E0B",
  LB: "#38BDF8",
  RB: "#38BDF8",
  CB: "#A78BFA",
  PV: "#34D399",
};

const POSITIONS: Position[] = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];

// Avatar posé directement sur le terrain — image SVG native <image> + clip circulaire
// au lieu d'un <foreignObject>, dont le rendu HTML-dans-SVG est peu fiable selon les
// navigateurs (photo qui se retrouve décalée à côté du rond plutôt que dedans).
function PitchSlotAvatar({
  x,
  y,
  r,
  firstName,
  lastName,
  photoUrl,
  photoOffsetX = 50,
  photoOffsetY = 50,
  photoZoom = 1,
  clipId,
}: {
  x: number;
  y: number;
  r: number;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  photoOffsetX?: number;
  photoOffsetY?: number;
  photoZoom?: number;
  clipId: string;
}) {
  const [errored, setErrored] = useState(false);
  const showPhoto = Boolean(photoUrl) && !errored;

  if (!showPhoto) {
    return (
      <text
        x={x} y={y + r * 0.32}
        textAnchor="middle" fill="#F1F5F9" fontSize={r * 0.85} fontWeight="700"
        style={{ fontFamily: "var(--font-display), sans-serif" }}
      >
        {initials(firstName, lastName)}
      </text>
    );
  }

  // Même formule que object-position CSS (voir PlayerAvatar/PhotoPositionEditor,
  // ce réglage doit rendre pareil partout) : l'image est dessinée plus grande que
  // le cercle visible (diamètre × zoom) puis translatée selon le pourcentage.
  const diameter = (r - 1) * 2;
  const imgSize = diameter * photoZoom;
  const imgX = x - (r - 1) + (diameter - imgSize) * (photoOffsetX / 100);
  const imgY = y - (r - 1) + (diameter - imgSize) * (photoOffsetY / 100);

  return (
    <>
      <clipPath id={clipId}>
        <circle cx={x} cy={y} r={r - 1} />
      </clipPath>
      <image
        href={photoUrl!}
        x={imgX} y={imgY} width={imgSize} height={imgSize}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
        onError={() => setErrored(true)}
      />
    </>
  );
}

// Écusson de club en incrustation, coin bas-droit de l'avatar — même idée qu'un
// maillot de jeu de sport plutôt qu'une ligne de texte "club" séparée : plus
// compact (le nom garde toute la place) et immédiatement reconnaissable. Le
// logo est posé tel quel (pas de disque ni de cercle de découpe derrière) —
// les écussons de club ont déjà leur propre silhouette (PNG détouré).
function PitchClubBadge({
  x,
  y,
  club,
}: {
  x: number;
  y: number;
  club: { shortName: string; logoUrl?: string | null };
}) {
  const [errored, setErrored] = useState(false);
  const cx = x + 9.5;
  const cy = y + 9.5;
  const showLogo = Boolean(club.logoUrl) && !errored;

  if (showLogo) {
    return (
      <image
        href={club.logoUrl!}
        x={cx - 4.75} y={cy - 4.75} width="9.5" height="9.5"
        preserveAspectRatio="xMidYMid meet"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <text
      x={cx} y={cy + 1.6}
      textAnchor="middle" fill="#94A3B8" fontSize="4.2" fontWeight="700"
      style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
    >
      {club.shortName.slice(0, 3)}
    </text>
  );
}

// Pastille de points — coin haut-gauche, miroir de l'écusson de club (petite,
// pleine, pas de gros pavé rectangulaire) : reste elle aussi dans le halo du
// joueur, jamais en zone morte au-dessus qui empiéterait sur le jeton du dessus.
function PointsBadge({ x, y, points }: { x: number; y: number; points: number }) {
  const positive = points >= 0;
  const color = positive ? "#34D399" : "#F87171";
  const cx = x - 9.5;
  const cy = y - 9.5;
  return (
    <g>
      <circle cx={cx} cy={cy} r="7" fill="#0E1116" stroke={color} strokeOpacity="0.85" strokeWidth="1" />
      <text
        x={cx} y={cy + 2}
        textAnchor="middle" fill={color} fontSize="7" fontWeight="700"
        style={{ fontFamily: "var(--font-arcade), monospace" }}
      >
        {points}
      </text>
    </g>
  );
}

// Brassard de capitaine — coin haut-droit, seul coin encore libre (club en bas-
// droit, points éventuels en haut-gauche) pour ne jamais se superposer.
function PitchCaptainBadge({ x, y }: { x: number; y: number }) {
  const cx = x + 9.5;
  const cy = y - 9.5;
  return (
    <g>
      <circle cx={cx} cy={cy} r="7" fill="#F59E0B" stroke="#0E1116" strokeWidth="1" />
      <text
        x={cx} y={cy + 2.6}
        textAnchor="middle" fill="#0E1116" fontSize="8" fontWeight="700"
        style={{ fontFamily: "var(--font-display), sans-serif" }}
      >
        C
      </text>
    </g>
  );
}

export function HandballPitch({
  starters,
  bench,
  captainId,
  onSwap,
  onEmptySlotClick,
  benchLabel = "Remplaçants · tap pour échanger",
}: HandballPitchProps) {
  const starterByPos = new Map(starters.map((p) => [p.position as Position, p]));
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {/* Demi-terrain — pleine largeur, cadré sur la zone de jeu (pas de bande morte).
          Cadre "écran de borne d'arcade" : coins coupés, glow teal, scanlines CRT. */}
      <div className="scanlines pixel-corners relative w-full overflow-hidden border border-accent/30 bg-[#0A1710] shadow-[0_0_20px_rgba(45,212,191,0.15),inset_0_0_0_1px_rgba(0,0,0,0.4)]">
        <svg
          viewBox={`0 ${VIEW_TOP} ${COURT} ${VIEW_HEIGHT}`}
          className="w-full"
          aria-label="Demi-terrain de handball (20m × 20m), cadré sur la zone de jeu"
        >
          <defs>
            <radialGradient id="courtFill" cx="50%" cy="15%" r="95%">
              <stop offset="0%" stopColor="#15291F" />
              <stop offset="100%" stopColor="#08140E" />
            </radialGradient>
            <pattern id="goalNet" width="4" height="4" patternUnits="userSpaceOnUse">
              <path d="M0 0 L4 4 M4 0 L0 4" stroke="#2DD4BF" strokeWidth="0.4" strokeOpacity="0.35" />
            </pattern>
          </defs>

          {/* Sol */}
          <rect x="0" y={VIEW_TOP} width={COURT} height={COURT - VIEW_TOP} fill="url(#courtFill)" />
          {/* Bandes de tonte alternées, subtiles */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={i * 40} y={VIEW_TOP} width="40" height={COURT - VIEW_TOP}
              fill="#FFFFFF" fillOpacity={i % 2 === 0 ? 0.012 : 0}
            />
          ))}

          {/* Contour du terrain (latéral + ligne de but, pas de ligne médiane visible ici) */}
          <path
            d={`M 2 ${VIEW_TOP} L 2 ${COURT - 2} L ${COURT - 2} ${COURT - 2} L ${COURT - 2} ${VIEW_TOP}`}
            fill="none" stroke="#2DD4BF" strokeWidth="1.25" strokeOpacity="0.35"
          />

          {/* Zone des 9m (ligne de jet-franc, pointillés) */}
          <path
            d={`M 10 ${COURT} A 90 90 0 0 1 190 ${COURT}`}
            fill="none" stroke="#2DD4BF" strokeWidth="1.25" strokeOpacity="0.4" strokeDasharray="4 3"
          />

          {/* Zone des 6m (surface de but, remplie légèrement) */}
          <path
            d={`M 40 ${COURT} A 60 60 0 0 1 160 ${COURT} Z`}
            fill="#2DD4BF" fillOpacity="0.07"
            stroke="#2DD4BF" strokeWidth="1.5" strokeOpacity="0.6"
          />

          {/* Marque du 7m */}
          <line x1="94" y1="130" x2="106" y2="130" stroke="#2DD4BF" strokeWidth="1.5" strokeOpacity="0.5" />

          {/* But */}
          <rect
            x="85" y={COURT} width="30" height={GOAL_DEPTH}
            fill="url(#goalNet)" stroke="#2DD4BF" strokeWidth="1.5" strokeOpacity="0.8"
          />

          {/* Postes joueurs */}
          {POSITIONS.map((pos) => {
            const coords = SLOT_COORDS[pos];
            const player = starterByPos.get(pos);
            const lastName = player?.lastName ?? null;

            // Sans onSwap (affichage lecture seule, ex. widget "Équipe type" du
            // dashboard), le tap ouvre la fiche du joueur plutôt que de rester inerte.
            const clickable = player ? true : Boolean(onEmptySlotClick);

            return (
              <g
                key={pos}
                onClick={
                  player
                    ? onSwap
                      ? () => onSwap(player.playerId)
                      : () => router.push(`/players/${player.playerId}`)
                    : onEmptySlotClick
                      ? () => onEmptySlotClick(pos)
                      : undefined
                }
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {player ? (
                  <>
                    <circle cx={coords.x} cy={coords.y} r={RING_R} fill={RING_HEX[pos]} opacity="0.16" />
                    <circle
                      cx={coords.x} cy={coords.y} r={R}
                      fill="#171C24" stroke={RING_HEX[pos]} strokeWidth="1.75" strokeOpacity="0.95"
                    />
                    <PitchSlotAvatar
                      x={coords.x} y={coords.y} r={R}
                      firstName={player.firstName} lastName={player.lastName}
                      photoUrl={player.photoUrl}
                      photoOffsetX={player.photoOffsetX}
                      photoOffsetY={player.photoOffsetY}
                      photoZoom={player.photoZoom}
                      clipId={`pitch-clip-${player.playerId}`}
                    />
                    <PitchClubBadge x={coords.x} y={coords.y} club={player.club} />
                    <text
                      x={coords.x} y={coords.y + R + 8}
                      textAnchor="middle" fill="#F1F5F9" fontSize={nameFontSize(lastName ?? "")} fontWeight="600"
                      style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
                    >
                      {lastName}
                    </text>
                    {player.points !== undefined && (
                      <PointsBadge x={coords.x} y={coords.y} points={player.points} />
                    )}
                    {captainId && player.playerId === captainId && (
                      <PitchCaptainBadge x={coords.x} y={coords.y} />
                    )}
                  </>
                ) : (
                  <>
                    <circle
                      cx={coords.x} cy={coords.y} r={R}
                      fill="#171C24" stroke={RING_HEX[pos]} strokeWidth="1.25" strokeOpacity={onEmptySlotClick ? "0.6" : "0.3"}
                      strokeDasharray="2.5 2.5"
                    />
                    <text
                      x={coords.x} y={coords.y + 1}
                      textAnchor="middle" fill={RING_HEX[pos]} fontSize="11" fontWeight="700"
                      opacity={onEmptySlotClick ? "0.85" : "0.35"}
                    >
                      +
                    </text>
                    <text
                      x={coords.x} y={coords.y + R + 8}
                      textAnchor="middle" fill="#94A3B8" fontSize="7.5" opacity="0.5"
                      style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
                    >
                      {pos}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Banc — horizontal sous le terrain (ARCHITECTURE.md §8.1), grille compacte
          qui passe sur 2 lignes en mobile plutôt qu'une colonne étroite à côté. */}
      {bench.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase leading-tight tracking-widest text-text-muted">
            {benchLabel}
          </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {bench.map((p) => (
              <button
                key={p.playerId}
                onClick={() => onSwap?.(p.playerId)}
                className="pixel-corners-sm flex flex-col items-center gap-1 border border-border bg-surface px-1 py-2 text-center transition-colors active:scale-[0.96] hover:border-accent/50"
              >
                <span className="relative">
                  <PlayerAvatar player={{ ...p, position: p.position as Position }} size="sm" />
                  {captainId && p.playerId === captainId && (
                    <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-bg bg-accent-secondary text-[8px] font-bold leading-none text-bg">
                      C
                    </span>
                  )}
                </span>
                <p className="w-full truncate text-[10px] font-medium leading-tight text-text">
                  {p.lastName}
                </p>
                <div className="flex items-center gap-1">
                  <ClubLogo club={p.club} size="xs" className="h-3 w-3" />
                  {p.points !== undefined && (
                    <span
                      className={`font-arcade text-[10px] leading-none ${p.points >= 0 ? "text-points-pos" : "text-points-neg"}`}
                    >
                      {p.points}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
