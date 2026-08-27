"use client";

import { Fragment, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo, WHITE_BG_CLUBS } from "@/components/ui/ClubLogo";
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

const R = 12; // rayon de l'avatar joueur (fallback initiales, pas de photo)
const RING_R = 13.5; // rayon du halo coloré derrière l'avatar (fallback initiales)

// Joueur "debout" sur le terrain (PNG détouré lnh.fr, ARCHITECTURE.md §8.1/§4.2,
// demande explicite de l'utilisateur) — remplace la pastille ronde uniquement
// quand une vraie photo existe (le fallback initiales garde l'ancien rendu en
// pastille, cf. plus bas). Pied ancré sur SLOT_COORDS, le corps s'étend vers le
// haut. Largeur choisie pour rester dans l'espacement le plus serré de la
// formation (CB au-dessus de PV, ~45 unités de marge verticale) une fois la
// hauteur dérivée du ratio des photos lnh.fr (~350×525, 2:3) : 22×33 tient sans
// chevaucher le voisin du dessus, vérifié en navigateur sur les 7 postes.
const PHOTO_WIDTH = 22;
const PHOTO_HEIGHT = PHOTO_WIDTH * 1.5;

// Coordonnées calibrées à la main via l'éditeur interactif (glisser-déposer +
// détection de chevauchement en direct, cf. session) — formation resserrée
// mais vérifiée sans aucun contact entre jetons.
// GK/PV/CB descendus le 2026-08-27 (demande explicite) : à leur y d'origine, le
// CB (le plus haut de l'axe central) avait le haut de sa silhouette (coords.y -
// PHOTO_HEIGHT) au-dessus de VIEW_TOP → tête coupée par le cadrage. PV et GK
// descendus d'autant pour garder l'écart avec le voisin du dessus (silhouette +
// nom, cf. boucle SVG) sans se chevaucher.
const SLOT_COORDS: Record<Position, { x: number; y: number }> = {
  GK: { x: 100.9, y: 198 },
  PV: { x: 100.3, y: 147 },
  LB: { x: 165.4, y: 93 },
  CB: { x: 99.2, y: 99 },
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

// Position en % (gauche/haut du conteneur) d'un point exprimé dans le repère du
// SVG (viewBox), décalé de dx/dy unités — sert à toute la couche HTML posée
// par-dessus le SVG (photos + badges), pour rester alignée sur les mêmes
// coordonnées que les anneaux/le terrain dessinés en SVG.
function pctPosition(coords: { x: number; y: number }, dx = 0, dy = 0) {
  return {
    left: `${((coords.x + dx) / COURT) * 100}%`,
    top: `${((coords.y + dy - VIEW_TOP) / VIEW_HEIGHT) * 100}%`,
  };
}

// Écusson de club en incrustation, coin bas-droit de l'avatar — même idée qu'un
// maillot de jeu de sport plutôt qu'une ligne de texte "club" séparée. Posé en
// HTML (comme la photo) et rendu APRÈS elle dans le DOM pour rester au-dessus —
// sinon la photo (couche HTML) recouvre les badges restés en SVG. Fond blanc
// pour les clubs dont le logo se voit mal sur fond sombre (WHITE_BG_CLUBS).
function PitchClubBadge({
  coords,
  club,
  dx = 9.5,
  dy = 9.5,
}: {
  coords: { x: number; y: number };
  club: { shortName: string; logoUrl?: string | null };
  dx?: number;
  dy?: number;
}) {
  const [errored, setErrored] = useState(false);
  const showLogo = Boolean(club.logoUrl) && !errored;
  const needsWhiteBg = WHITE_BG_CLUBS.has(club.shortName);
  const sizePct = (9.5 / COURT) * 100;

  return (
    <div
      className={cnAbsoluteBadge(needsWhiteBg)}
      style={{ ...pctPosition(coords, dx, dy), width: `${sizePct}%`, aspectRatio: "1 / 1" }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logos hébergés localement mais chemin dynamique par club
        <img
          src={club.logoUrl!}
          alt={club.shortName}
          className="h-full w-full object-contain"
          style={needsWhiteBg ? { padding: "8%" } : undefined}
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[6px] font-bold text-text-muted">
          {club.shortName.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function cnAbsoluteBadge(withWhiteBg: boolean) {
  return `pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full${withWhiteBg ? " bg-white" : ""}`;
}

// Pastille de points — coin haut-gauche, miroir de l'écusson de club.
function PointsBadge({
  coords,
  points,
  dx = -9.5,
  dy = -9.5,
}: {
  coords: { x: number; y: number };
  points: number;
  dx?: number;
  dy?: number;
}) {
  const positive = points >= 0;
  const color = positive ? "#34D399" : "#F87171";
  const sizePct = ((7 * 2) / COURT) * 100;
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border"
      style={{
        ...pctPosition(coords, dx, dy),
        width: `${sizePct}%`,
        aspectRatio: "1 / 1",
        backgroundColor: "#0E1116",
        borderColor: color,
      }}
    >
      <span className="font-arcade text-[7px] font-bold leading-none" style={{ color }}>
        {points}
      </span>
    </div>
  );
}

// Brassard de capitaine — coin haut-droit, seul coin encore libre.
function PitchCaptainBadge({
  coords,
  dx = 9.5,
  dy = -9.5,
}: {
  coords: { x: number; y: number };
  dx?: number;
  dy?: number;
}) {
  const sizePct = ((7 * 2) / COURT) * 100;
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-bg"
      style={{
        ...pctPosition(coords, dx, dy),
        width: `${sizePct}%`,
        aspectRatio: "1 / 1",
        backgroundColor: "#F59E0B",
      }}
    >
      <span className="font-display text-[8px] font-bold leading-none text-bg">C</span>
    </div>
  );
}

// Photo d'un titulaire "debout" sur le terrain, posée en HTML par-dessus le SVG
// (pas dans un <image>+clipPath SVG — vérifiée fiable sur le banc, contrairement
// au rendu SVG précédent qui ne donnait pas un résultat identique à l'aperçu admin
// malgré une formule pourtant équivalente sur le papier). Contrairement à
// PlayerAvatar (pastille ronde, recadrage/zoom admin), le PNG lnh.fr est déjà
// détouré : object-contain, aucun recadrage — l'image entière, telle quelle.
function PitchStarterPhoto({ photoUrl, alt }: { photoUrl: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <img
      src={photoUrl}
      alt={alt}
      className="h-full w-full object-contain object-bottom"
      onError={() => setErrored(true)}
    />
  );
}

export function HandballPitch({
  starters,
  bench,
  captainId,
  onSwap,
  onEmptySlotClick,
  benchLabel,
}: HandballPitchProps) {
  const t = useTranslations("team");
  const resolvedBenchLabel = benchLabel ?? t("pitch.benchLabel");
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
          aria-label={t("pitch.svgAriaLabel")}
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

          {/* Postes joueurs. Sans photo : anneau + initiales + nom, tout en SVG
              (inchangé). Avec photo : juste une ombre au sol (ancre visuelle,
              remplace la pastille) + le nom — le joueur "debout" lui-même est posé
              en HTML par-dessus (voir la boucle juste après ce <svg>), qui porte
              alors son propre clic (pointer-events actif sur ce calque-là plutôt
              qu'ici, cf. commentaire de PitchStarterPhoto) : un <g> SVG ne réagit au
              clic que sur les formes qu'il contient réellement, pas sur toute la
              silhouette debout qui vit hors du SVG. */}
          {POSITIONS.map((pos) => {
            const coords = SLOT_COORDS[pos];
            const player = starterByPos.get(pos);
            const lastName = player?.lastName ?? null;
            const clickable = player ? true : Boolean(onEmptySlotClick);
            const standing = Boolean(player?.photoUrl);

            return (
              <g
                key={pos}
                onClick={
                  player && !standing
                    ? onSwap
                      ? () => onSwap(player.playerId)
                      : () => router.push(`/players/${player.playerId}`)
                    : onEmptySlotClick && !player
                      ? () => onEmptySlotClick(pos)
                      : undefined
                }
                style={{ cursor: clickable && !standing ? "pointer" : "default" }}
              >
                {player ? (
                  standing ? (
                    <>
                      <ellipse
                        cx={coords.x} cy={coords.y + 3}
                        rx={PHOTO_WIDTH * 0.32} ry={PHOTO_WIDTH * 0.1}
                        fill={RING_HEX[pos]} opacity="0.25"
                      />
                      <text
                        x={coords.x} y={coords.y + 12}
                        textAnchor="middle" fill="#F1F5F9" fontSize={nameFontSize(lastName ?? "")} fontWeight="600"
                        style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
                      >
                        {lastName}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle cx={coords.x} cy={coords.y} r={RING_R} fill={RING_HEX[pos]} opacity="0.16" />
                      <circle
                        cx={coords.x} cy={coords.y} r={R}
                        fill="#171C24" stroke={RING_HEX[pos]} strokeWidth="1.75" strokeOpacity="0.95"
                      />
                      <text
                        x={coords.x} y={coords.y + R * 0.32}
                        textAnchor="middle" fill="#F1F5F9" fontSize={R * 0.85} fontWeight="700"
                        style={{ fontFamily: "var(--font-display), sans-serif" }}
                      >
                        {initials(player.firstName, player.lastName)}
                      </text>
                      <text
                        x={coords.x} y={coords.y + R + 8}
                        textAnchor="middle" fill="#F1F5F9" fontSize={nameFontSize(lastName ?? "")} fontWeight="600"
                        style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
                      >
                        {lastName}
                      </text>
                    </>
                  )
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

        {/* Titulaires "debout" — superposition HTML alignée sur les mêmes
            coordonnées que le SVG (converties en %), au-dessus du terrain. Pied
            ancré sur SLOT_COORDS (translateX seul, pas translateY : le top calculé
            par pctPosition(coords, 0, -PHOTO_HEIGHT) est déjà le bord haut de la
            silhouette). Pointer-events actif ICI (pas pointer-events-none comme le
            reste de la couche HTML) : c'est ce calque, pas le <g> SVG en dessous
            (qui ne dessine plus qu'une ombre au pied), qui porte le clic pour un
            joueur avec photo — voir le commentaire dans la boucle SVG plus haut. */}
        {POSITIONS.map((pos) => {
          const player = starterByPos.get(pos);
          if (!player?.photoUrl) return null;
          const coords = SLOT_COORDS[pos];
          const widthPct = (PHOTO_WIDTH / COURT) * 100;
          return (
            <div
              key={pos}
              onClick={onSwap ? () => onSwap(player.playerId) : () => router.push(`/players/${player.playerId}`)}
              className="absolute -translate-x-1/2 cursor-pointer"
              style={{ ...pctPosition(coords, 0, -PHOTO_HEIGHT), width: `${widthPct}%`, aspectRatio: "2 / 3" }}
            >
              <PitchStarterPhoto photoUrl={player.photoUrl} alt={`${player.firstName} ${player.lastName}`} />
            </div>
          );
        })}

        {/* Badges (club/points/capitaine) — rendus APRÈS la couche photo ci-dessus
            pour toujours passer au-dessus d'elle (sinon les logos de club, par
            exemple, se retrouvent recouverts par la photo du joueur). Ancrage
            différent selon pastille (coins du cercle, inchangé) ou joueur debout
            (coins de la silhouette : club/pied, points+capitaine/tête). */}
        {POSITIONS.map((pos) => {
          const player = starterByPos.get(pos);
          if (!player) return null;
          const coords = SLOT_COORDS[pos];
          const standing = Boolean(player.photoUrl);
          const clubOffset = standing ? { dx: PHOTO_WIDTH / 2 - 2, dy: -3 } : { dx: 9.5, dy: 9.5 };
          const pointsOffset = standing ? { dx: -PHOTO_WIDTH / 2 + 2, dy: -PHOTO_HEIGHT + 5 } : { dx: -9.5, dy: -9.5 };
          const captainOffset = standing ? { dx: PHOTO_WIDTH / 2 - 2, dy: -PHOTO_HEIGHT + 5 } : { dx: 9.5, dy: -9.5 };
          return (
            <Fragment key={pos}>
              <PitchClubBadge coords={coords} club={player.club} {...clubOffset} />
              {player.points !== undefined && <PointsBadge coords={coords} points={player.points} {...pointsOffset} />}
              {captainId && player.playerId === captainId && <PitchCaptainBadge coords={coords} {...captainOffset} />}
            </Fragment>
          );
        })}
      </div>

      {/* Banc — horizontal sous le terrain (ARCHITECTURE.md §8.1), grille compacte
          qui passe sur 2 lignes en mobile plutôt qu'une colonne étroite à côté. */}
      {bench.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase leading-tight tracking-widest text-text-muted">
            {resolvedBenchLabel}
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
