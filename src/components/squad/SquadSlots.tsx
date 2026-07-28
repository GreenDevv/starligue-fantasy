"use client";

import { useTranslations } from "next-intl";
import type { Position } from "@/lib/squad/validation";
import { POSITIONS } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";

export interface SlotPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl?: string | null;
  club: { shortName: string; logoUrl?: string | null };
}

interface SquadSlotsProps {
  squad: Record<Position, [SlotPlayer | null, SlotPlayer | null]>;
  onSlotClick: (position: Position, index: 0 | 1, player: SlotPlayer | null) => void;
  activePosition?: Position;
}

// Liste des 14 emplacements (2 par poste) pendant la constitution d'effectif —
// délibérément sans terrain ni notion titulaire/remplaçant : ce choix se fait
// ensuite sur /team/start (ou /simulation/start).
export function SquadSlots({ squad, onSlotClick, activePosition }: SquadSlotsProps) {
  const t = useTranslations("labels");
  return (
    <div className="flex flex-col gap-1.5">
      {POSITIONS.map((pos) => (
        <div
          key={pos}
          className={`pixel-corners-sm flex items-center gap-2 border px-2 py-1.5 transition-colors ${
            activePosition === pos ? "border-accent/50 bg-accent/5 shadow-glow-accent" : "border-border bg-surface"
          }`}
        >
          <span className="w-7 shrink-0 text-center text-[10px] font-bold uppercase tracking-wide text-text-muted">
            {t(`positionShort.${pos}`)}
          </span>
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            {squad[pos].map((player, idx) => (
              <button
                key={idx}
                onClick={() => onSlotClick(pos, idx as 0 | 1, player)}
                className={
                  player
                    ? "pixel-corners-sm flex min-w-0 items-center gap-1.5 border border-border bg-bg px-1.5 py-1 text-left transition-colors active:scale-[0.97] hover:border-points-neg/50"
                    : "pixel-corners-sm flex items-center justify-center gap-1 border border-dashed border-border/70 px-1.5 py-1 text-text-muted transition-colors active:scale-[0.97] hover:border-accent/50 hover:text-accent"
                }
              >
                {player ? (
                  <>
                    <PlayerAvatar player={player} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium leading-tight text-text">
                        {player.firstName} {player.lastName}
                      </p>
                      <p className="flex items-center gap-1 text-[9px] leading-tight text-text-muted">
                        <ClubLogo club={player.club} size="xs" className="h-2.5 w-2.5" />
                        {player.club.shortName}
                      </p>
                    </div>
                  </>
                ) : (
                  <span className="text-[11px]">+ Choisir</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
