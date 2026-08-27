"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Petit dropdown pour naviguer parmi les journées Starligue depuis le strip
// "prochains matchs" de la home (demande explicite de l'utilisateur). Portal +
// coords calculées (même pattern que ClubSwitcher/LocaleSwitcher) : le strip
// parent est en `pixel-corners` (clip-path), qui rognerait un menu simplement
// `absolute`. `label` est pré-traduit côté page serveur (fonction non
// sérialisable à travers la frontière RSC).
export function GameweekDropdown({
  current,
  total,
  hrefBase,
  label,
}: {
  current: number;
  total: number;
  hrefBase: string;
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

  const gameweeks = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] uppercase tracking-widest text-text-muted transition-colors hover:text-text"
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
                href={`${hrefBase}?gw=${gw}`}
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
