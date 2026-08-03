"use client";

import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Timeline horizontale pour naviguer parmi toutes les journées Starligue (page
// /matches) — demande explicite de l'utilisateur, en complément des flèches
// précédent/suivant existantes. `items` (numéro + libellé court "J{n}") est
// pré-traduit côté page serveur : une fonction de formatage ne serait pas
// sérialisable à travers la frontière RSC. Recentre automatiquement la journée
// active au montage/changement (utile quand il y en a plus que ce qui tient à
// l'écran).
export function GameweekTimeline({
  items,
  current,
  hrefBase,
}: {
  items: { number: number; label: string }[];
  current: number;
  hrefBase: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current]);

  return (
    <div ref={containerRef} className="flex gap-1.5 overflow-x-auto pb-1">
      {items.map(({ number, label }) => {
        const active = number === current;
        return (
          <Link
            key={number}
            href={`${hrefBase}?gw=${number}`}
            data-active={active ? "true" : undefined}
            className={cn(
              "pixel-corners-sm shrink-0 border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent shadow-glow-accent"
                : "border-border text-text-muted hover:bg-border/20 hover:text-text"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
