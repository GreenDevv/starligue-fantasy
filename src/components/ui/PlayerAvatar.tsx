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
  // "avatar" (défaut) : pastille ronde, photo recadrée/zoomée (object-cover, réglages
  // admin) — comportement historique, inchangé partout où variant est omis.
  // "photo" : plus de pastille du tout — le PNG détouré tel quel (object-contain,
  // fond transparent visible), sans recadrage/zoom (n'aurait pas de sens sur une
  // image déjà non rognée). Demande explicite de l'utilisateur une fois les vraies
  // photos lnh.fr disponibles pour la quasi-totalité des joueurs (ARCHITECTURE.md
  // §8.1) — utilisé sur /players, /market, la fiche joueur. Le fallback (pas de
  // photo) reste un badge initiales, juste carré plutôt que rond pour rester
  // cohérent avec les photos alentour dans une même liste.
  variant?: "avatar" | "photo";
  // variant="photo" seulement. "full" (défaut) : object-contain, le PNG entier —
  // adapté à un grand format (fiche joueur, terrain). "head" : object-cover ancré
  // en haut, recadre sur tête+épaules — un joueur en pied entier tient dans un
  // carré de 32px (taille "sm", listes /players et /market) mais devient
  // méconnaissable à cette échelle ; zoomer sur la tête le rend reconnaissable.
  // Fiable sans réglage par joueur (contrairement à variant="avatar") car les
  // photos lnh.fr sont toutes au même cadrage (tête near du haut, ARCHITECTURE.md
  // §4.2/§8.1) — demande explicite de l'utilisateur.
  focus?: "full" | "head";
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
export function PlayerAvatar({ player, size = "md", className = "", variant = "avatar", focus = "full" }: PlayerAvatarProps) {
  const [errored, setErrored] = useState(false);
  const theme = POSITION_THEME[player.position];
  const sizeClass = SIZES[size];
  const showPhoto = Boolean(player.photoUrl) && !errored;
  const isPhotoVariant = variant === "photo";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-display font-bold text-bg",
        isPhotoVariant ? "rounded-lg" : "overflow-hidden rounded-full ring-1",
        // Fond dégradé par poste : toujours utile en fallback initiales, mais
        // inutile (et visible en transparence derrière un PNG détouré) une fois
        // une vraie photo affichée en variant "photo".
        (!isPhotoVariant || !showPhoto) && cn("bg-gradient-to-br", theme.gradient, !isPhotoVariant && theme.ring),
        sizeClass,
        className
      )}
    >
      {showPhoto ? (
        isPhotoVariant ? (
          // focus="full" : image entière, non rognée (object-contain). focus="head" :
          // recadrée en haut (object-cover + object-top) pour rester reconnaissable en
          // petit — voir commentaire de la prop `focus` ci-dessus.
          // eslint-disable-next-line @next/next/no-img-element -- photo hébergée sur des domaines externes imprévisibles, incompatible avec next/image sans whitelist statique
          <img
            src={player.photoUrl!}
            alt={`${player.firstName} ${player.lastName}`}
            className={focus === "head" ? "h-full w-full object-cover object-top" : "h-full w-full object-contain"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
          />
        ) : (player.photoZoom ?? 1) > 1 ? (
          // Zoom implémenté en agrandissant la boîte de l'image elle-même (object-fit:
          // cover recalculé à cette taille) plutôt qu'un transform:scale() post-crop —
          // ce dernier ne fait que magnifier la fenêtre déjà sélectionnée par
          // object-position au lieu de vraiment "dézoomer" sur plus de résolution/zone
          // de la photo. Même formule que PitchSlotAvatar (rendu SVG du terrain) et
          // PhotoPositionEditor (aperçu admin) — les trois doivent rester identiques.
          // N'a d'effet visuel qu'à zoom>1 (voir branche par défaut ci-dessous) — un
          // admin qui a réellement calibré ce joueur via PhotoPositionEditor.
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
          // Par défaut (aucun réglage admin, zoom<=1 — la formule ci-dessus n'a
          // alors AUCUN effet, cf. commentaire) : recadrage centré classique qui
          // coupe le haut de la tête sur les photos lnh.fr (cadrées tête en haut,
          // corps entier 2:3 écrasé dans une pastille 1:1 carrée). Même recadrage
          // que variant="photo" focus="head" (object-top), fiable sans réglage
          // par joueur pour la même raison — demande explicite de l'utilisateur
          // une fois les vraies photos en place sur le banc.
          // eslint-disable-next-line @next/next/no-img-element -- photo hébergée sur des domaines de clubs externes/imprévisibles, incompatible avec next/image sans whitelist statique
          <img
            src={player.photoUrl!}
            alt={`${player.firstName} ${player.lastName}`}
            className="h-full w-full object-cover object-top"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
          />
        )
      ) : (
        <span className="leading-none tracking-tight">{initials(player.firstName, player.lastName)}</span>
      )}
    </span>
  );
}
