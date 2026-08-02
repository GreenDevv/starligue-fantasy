"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";

interface SwitcherClub {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

// Logo du club cliquable ouvrant un menu déroulant pour naviguer directement vers
// la page d'un autre club (demande explicite de l'utilisateur, page club
// /clubs/[id]). Menu monté via portal en position fixed, calée sur le
// getBoundingClientRect du logo — le conteneur d'en-tête (pixel-corners, clip-path)
// rognerait sinon un menu positionné en absolute (même piège déjà résolu pour
// PlayerSeasonRecapTrigger, src/components/players/PlayerSeasonRecapTrigger.tsx).
// `clubs` inclut le club courant (mis en évidence dans la liste plutôt qu'exclu —
// permet de voir en un coup d'œil "où je suis" dans la liste alphabétique).
export function ClubSwitcher({ currentClub, clubs }: { currentClub: SwitcherClub; clubs: SwitcherClub[] }) {
  const t = useTranslations("clubs");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
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
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  }

  function select(clubId: string) {
    setOpen(false);
    if (clubId === currentClub.id) return;
    router.push(`/clubs/${clubId}`);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("detail.switchClub")}
        className="block shrink-0 rounded-lg transition-opacity hover:opacity-80"
      >
        <ClubLogo club={currentClub} size="xl" largeOnDesktop />
      </button>

      {typeof document !== "undefined" &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={t("detail.switchClub")}
            style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 100 }}
            className="pixel-corners-sm flex max-h-80 w-56 flex-col gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
          >
            {clubs.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === currentClub.id}
                onClick={() => select(c.id)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  c.id === currentClub.id ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
                }`}
              >
                <ClubLogo club={c} size="sm" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
