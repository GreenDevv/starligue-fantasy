"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon } from "@/components/ui/icons";
import type { WidgetSize } from "@/lib/dashboard/layout";

const SIZE_OPTIONS: { size: WidgetSize; label: string; preview: string }[] = [
  { size: "mini", label: "Mini", preview: "h-1.5 w-1.5" },
  { size: "square", label: "Carré", preview: "h-2.5 w-2.5" },
  { size: "wide", label: "Long", preview: "h-1.5 w-3.5" },
];

// Chrome générique (poignée de drag + taille + retrait) autour de chaque widget du
// dashboard — poignée dédiée plutôt que toute la carte draggable, pour ne pas
// capter les clics sur les contrôles internes des widgets (ex: toggle Journée/
// Saison/Match de StatLeaderCard). showRemove=false pour "player-stats", qui a
// déjà son propre "×" interne (StatLeaderCard).
export function DashboardWidgetShell({
  id,
  size,
  onSizeChange,
  children,
  onRemove,
  showRemove = true,
  className = "",
}: {
  id: string;
  size: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  children: ReactNode;
  onRemove: () => void;
  showRemove?: boolean;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group/widget flex h-full flex-col gap-0.5 ${className}`}>
      {/* Chrome toujours visible sur tactile (pas de :hover sur mobile — le
          masquer y rendrait juste les contrôles ternes en permanence). À partir
          de sm: (souris/trackpad), discret par défaut et pleine visibilité au
          survol/focus — le contenu du widget prime une fois la disposition
          choisie. Jamais display:none, juste en retrait visuel. */}
      <div className="flex h-5 items-center justify-between gap-1.5 transition-opacity sm:opacity-40 sm:focus-within:opacity-100 sm:group-hover/widget:opacity-100">
        <button
          {...attributes}
          {...listeners}
          aria-label="Réorganiser ce widget"
          className="cursor-grab touch-none rounded p-0.5 text-text-muted transition-colors hover:text-text active:cursor-grabbing"
        >
          <DragHandleIcon className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.size}
                onClick={() => onSizeChange(opt.size)}
                aria-label={`Taille ${opt.label}`}
                aria-pressed={size === opt.size}
                title={opt.label}
                className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                  size === opt.size ? "bg-accent/20" : "hover:bg-border/40"
                }`}
              >
                <span className={`rounded-[1px] ${opt.preview} ${size === opt.size ? "bg-accent" : "bg-text-muted"}`} />
              </button>
            ))}
          </div>
          {showRemove && (
            <button
              onClick={onRemove}
              aria-label="Retirer ce widget du tableau de bord"
              className="rounded px-1 text-sm text-text-muted transition-colors hover:text-points-neg"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
