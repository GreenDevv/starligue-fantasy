"use client";

import type { Position } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { POSITION_SHORT } from "@/components/ui/positionTheme";

export interface CaptainPickerPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl?: string | null;
  club: { shortName: string; logoUrl?: string | null };
}

interface CaptainPickerProps {
  squad: CaptainPickerPlayer[];
  captainId: string | null;
  onSelect: (playerId: string) => void;
  disabled?: boolean;
}

// Sélecteur de capitaine (×2 points) — grille des 14 joueurs de l'effectif, étoile
// pour désigner. Composant partagé jeu en direct / simulation (ARCHITECTURE.md §8.1
// palette + composants).
export function CaptainPicker({ squad, captainId, onSelect, disabled = false }: CaptainPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {squad.map((p) => {
        const isCaptain = p.playerId === captainId;
        return (
          <button
            key={p.playerId}
            type="button"
            onClick={() => !disabled && onSelect(p.playerId)}
            disabled={disabled}
            className={[
              "flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
              isCaptain
                ? "border-accent-secondary bg-accent-secondary/10"
                : "border-border bg-surface hover:border-accent-secondary/40",
              disabled ? "cursor-not-allowed opacity-60" : "active:bg-border/20",
            ].join(" ")}
          >
            <PlayerAvatar player={p} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium leading-tight text-text">
                {p.firstName} {p.lastName}
              </p>
              <p className="flex items-center gap-1 text-[10px] leading-tight text-text-muted">
                <ClubLogo club={p.club} size="xs" className="h-2.5 w-2.5" />
                {POSITION_SHORT[p.position]} · {p.club.shortName}
              </p>
            </div>
            <span
              className={[
                "shrink-0 text-base leading-none",
                isCaptain ? "text-accent-secondary" : "text-text-muted/40",
              ].join(" ")}
              aria-hidden
            >
              {isCaptain ? "★" : "☆"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
