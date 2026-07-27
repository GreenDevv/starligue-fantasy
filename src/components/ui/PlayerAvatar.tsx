"use client";

import { useState } from "react";
import type { Position } from "@/lib/squad/validation";
import { POSITION_THEME, initials } from "./positionTheme";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  player: {
    firstName: string;
    lastName: string;
    position: Position;
    photoUrl?: string | null;
    // Recadrage réglé par un admin (/admin/players) — object-position + zoom sur
    // la photo, jamais l'image originale rognée : absents = centré, pas de zoom.
    photoOffsetX?: number | null;
    photoOffsetY?: number | null;
    photoZoom?: number | null;
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES: Record<NonNullable<PlayerAvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-11 w-11 text-xs",
  lg: "h-16 w-16 text-base",
  xl: "h-24 w-24 text-xl",
};

// Photo/initiales — ARCHITECTURE.md §8.1 (PlayerCard). Vraies photos rares
// (droits d'image), fallback initiales sur dégradé coloré par poste toujours fiable.
export function PlayerAvatar({ player, size = "md", className = "" }: PlayerAvatarProps) {
  const [errored, setErrored] = useState(false);
  const theme = POSITION_THEME[player.position];
  const sizeClass = SIZES[size];
  const showPhoto = Boolean(player.photoUrl) && !errored;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-display font-bold text-bg ring-1",
        theme.gradient,
        theme.ring,
        sizeClass,
        className
      )}
    >
      {showPhoto ? (
        // Zoom implémenté en agrandissant la boîte de l'image elle-même (object-fit:
        // cover recalculé à cette taille) plutôt qu'un transform:scale() post-crop —
        // ce dernier ne fait que magnifier la fenêtre déjà sélectionnée par
        // object-position au lieu de vraiment "dézoomer" sur plus de résolution/zone
        // de la photo. Même formule que PitchSlotAvatar (rendu SVG du terrain) et
        // PhotoPositionEditor (aperçu admin) — les trois doivent rester identiques.
        // eslint-disable-next-line @next/next/no-img-element -- photo hébergée sur des domaines de clubs externes/imprévisibles, incompatible avec next/image sans whitelist statique
        <img
          src={player.photoUrl!}
          alt={`${player.firstName} ${player.lastName}`}
          className="absolute h-full w-full object-cover"
          style={{
            width: `${(player.photoZoom ?? 1) * 100}%`,
            height: `${(player.photoZoom ?? 1) * 100}%`,
            left: `${(100 - (player.photoZoom ?? 1) * 100) * ((player.photoOffsetX ?? 50) / 100)}%`,
            top: `${(100 - (player.photoZoom ?? 1) * 100) * ((player.photoOffsetY ?? 50) / 100)}%`,
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="leading-none tracking-tight">{initials(player.firstName, player.lastName)}</span>
      )}
    </span>
  );
}
