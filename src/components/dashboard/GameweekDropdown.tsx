"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Petit dropdown pour naviguer parmi les journées Starligue depuis un strip de
// la home ("prochains matchs" : n'importe quelle journée 1..total ; "résultats",
// demande explicite du 13/09 : seulement celles ayant au moins un résultat, via
// `availableGameweeks` — naviguer vers une journée sans résultat n'aurait pas de
// sens dans ce contexte). Portal + coords calculées (même pattern que
// ClubSwitcher/LocaleSwitcher) : le strip parent est en `pixel-corners`
// (clip-path), qui rognerait un menu simplement `absolute`. `label` est
// pré-traduit côté page serveur (fonction non sérialisable à travers la
// frontière RSC).
export function GameweekDropdown({
  current,
  total,
  availableGameweeks,
  hrefBase,
  queryParam = "gw",
  label,
}: {
  current: number;
  total: number;
  // Sous-ensemble explicite de journées à lister, prioritaire sur 1..total.
  availableGameweeks?: number[];
  hrefBase: string;
  // Nom du paramètre de requête — deux strips avec un dropdown peuvent coexister
  // sur la même page (prochains matchs "gw" + résultats "resultsGw", 13/09), il
  // leur faut chacun leur propre paramètre pour ne pas s'écraser l'un l'autre.
  queryParam?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  const gameweeks = availableGameweeks ?? Array.from({ length: total }, (_, i) => i + 1);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        // tracking-wide (pas -widest, comme le reste des petites capitales du site) :
        // "MATCHDAY" est nettement plus long que "JOURNÉE" et l'espacement maximal
        // aggravait le débordement en anglais dans un widget étroit (feedback
        // utilisateur, ARCHITECTURE.md contexte MatchesStrip).
        className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] uppercase tracking-wide text-text-muted transition-colors hover:text-text"
      >
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {typeof document !== "undefined" &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={label}
            style={{ position: "fixed", top: coords.top, right: coords.right, zIndex: 100 }}
            className="pixel-corners-sm grid max-h-64 w-32 grid-cols-4 gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
          >
            {gameweeks.map((gw) => (
              <Link
                key={gw}
                href={`${hrefBase}?${queryParam}=${gw}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded px-1 py-1.5 text-center text-xs transition-colors",
                  gw === current ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
                )}
              >
                {gw}
              </Link>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
