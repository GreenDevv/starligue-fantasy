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
        // eslint-disable-next-line @next/next/no-img-element -- photo hébergée sur des domaines de clubs externes/imprévisibles, incompatible avec next/image sans whitelist statique
        <img
          src={player.photoUrl!}
          alt={`${player.firstName} ${player.lastName}`}
          className="h-full w-full object-cover"
          style={{
            objectPosition: `${player.photoOffsetX ?? 50}% ${player.photoOffsetY ?? 50}%`,
            transform: `scale(${player.photoZoom ?? 1})`,
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
