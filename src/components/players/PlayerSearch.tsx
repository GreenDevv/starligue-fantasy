"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

export interface PlayerSearchOption {
  id: string;
  firstName: string;
  lastName: string;
  club: { shortName: string };
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Petite recherche joueur (250+ joueurs = trop long en <select> natif) — filtre
// client-side sur la liste déjà chargée, pas de requête réseau par frappe. Utilisé
// à l'inscription (src/app/(public)/register/page.tsx) et sur /account.
export function PlayerSearch({
  players,
  value,
  onChange,
}: {
  players: PlayerSearchOption[];
  value: string;
  onChange: (playerId: string) => void;
}) {
  const t = useTranslations("players");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = players.find((p) => p.id === value) ?? null;

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return players.filter((p) => normalize(`${p.firstName} ${p.lastName}`).includes(q)).slice(0, 8);
  }, [players, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-4 py-2.5">
        <span className="text-text">
          {selected.firstName} {selected.lastName} <span className="text-text-muted">— {selected.club.shortName}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="shrink-0 text-xs text-text-muted hover:text-text"
        >
          {t("search.change")}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("search.placeholder")}
        className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
      />
      {open && query.trim() !== "" && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-2.5 text-sm text-text-muted">{t("search.noResults")}</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-text transition-colors hover:bg-accent/10"
              >
                <span>
                  {p.firstName} {p.lastName}
                </span>
                <span className="shrink-0 text-xs text-text-muted">{p.club.shortName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
