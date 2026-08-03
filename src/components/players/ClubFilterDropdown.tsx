"use client";

import { useEffect, useRef, useState } from "react";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { ActiveClub } from "@/lib/clubs/get-active-clubs";

// Dropdown custom (bouton + panel), même pattern d'interaction que
// LocaleSwitcher.tsx (click-outside/Escape pour fermer) — nécessaire pour
// afficher les logos club, qu'un <select> natif ne peut pas rendre dans ses
// <option> (limitation HTML universelle, pas spécifique à ce projet).
export function ClubFilterDropdown({
  clubs,
  value,
  onChange,
  allLabel,
}: {
  clubs: ActiveClub[];
  value: string;
  onChange: (clubId: string) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = clubs.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  function select(clubId: string) {
    setOpen(false);
    onChange(clubId);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="pixel-corners-sm flex w-full items-center gap-2 border border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:border-accent/50 focus:border-accent focus:outline-none"
      >
        {selected ? <ClubLogo club={selected} size="xs" /> : null}
        <span className="flex-1 truncate text-left">{selected ? selected.shortName : allLabel}</span>
        <span className="text-text-muted">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="pixel-corners-sm absolute left-0 top-full z-30 mt-1 flex max-h-72 w-full min-w-[12rem] flex-col gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => select("")}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
              value === "" ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
            }`}
          >
            {allLabel}
          </button>
          {clubs.map((club) => (
            <button
              key={club.id}
              type="button"
              role="option"
              aria-selected={club.id === value}
              onClick={() => select(club.id)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                club.id === value ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
              }`}
            >
              <ClubLogo club={club} size="xs" />
              <span className="truncate">{club.shortName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
