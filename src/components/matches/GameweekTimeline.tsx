"use client";

import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Timeline horizontale pour naviguer parmi toutes les journées Starligue (page
// /matches) — demande explicite de l'utilisateur, en complément des flèches
// précédent/suivant existantes. Rendu façon "frise de niveaux" (ligne + pastilles
// rondes, journée active agrandie/lumineuse) plutôt que des chips rectangulaires
// génériques — plus cohérent avec l'esthétique "borne d'arcade" du site
// (ARCHITECTURE.md §8.1) et lisible d'un coup d'œil. Fondus en dégradé sur les
// bords : seul indice visuel qu'il y a plus de journées que ce qui tient à
// l'écran, sans flèches de scroll dédiées. `items` (numéro + libellé "Journée
// N") pré-traduit côté page serveur : une fonction de formatage ne serait pas
// sérialisable à travers la frontière RSC. Recentre automatiquement la journée
// active au montage/changement.
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
    <div className="pixel-corners relative overflow-hidden border border-border bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-surface to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-surface to-transparent"
      />
      <div ref={containerRef} className="overflow-x-auto px-6 py-4">
        <div className="relative flex w-max items-center gap-5">
          <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          {items.map(({ number, label }) => {
            const active = number === current;
            return (
              <Link
                key={number}
                href={`${hrefBase}?gw=${number}`}
                data-active={active ? "true" : undefined}
                title={label}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative z-10 flex shrink-0 items-center justify-center rounded-full border font-arcade transition-all duration-150",
                  active
                    ? "h-10 w-10 border-accent bg-accent text-lg text-bg shadow-glow-accent"
                    : "h-8 w-8 border-border bg-bg text-sm text-text-muted hover:border-accent/60 hover:text-text"
                )}
              >
                {number}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
