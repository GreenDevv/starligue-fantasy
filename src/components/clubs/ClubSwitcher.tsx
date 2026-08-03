"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface SwitcherClub {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// Sous sm: (< 640px, seuil Tailwind), le logo ouvre un menu plein écran animé
// (Framer Motion) plutôt que le petit dropdown desktop — demande explicite de
// l'utilisateur ("un vrai menu qui prenne tout l'écran... comme un menu
// hamburger"). Détection JS (pas de solution CSS pure possible ici : les deux
// variantes ont des structures DOM différentes, coords calculées vs plein écran).
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639.98px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

// Logo du club cliquable ouvrant un menu déroulant pour naviguer directement vers
// la page d'un autre club (demande explicite de l'utilisateur, page club
// /clubs/[id]). Menu monté via portal en position fixed, calée sur le
// getBoundingClientRect du logo — le conteneur d'en-tête (pixel-corners, clip-path)
// rognerait sinon un menu positionné en absolute (même piège déjà résolu pour
// PlayerSeasonRecapTrigger, src/components/players/PlayerSeasonRecapTrigger.tsx).
// `clubs` inclut le club courant (mis en évidence dans la liste plutôt qu'exclu —
// permet de voir en un coup d'œil "où je suis" dans la liste). Triée par
// classement Starligue courant (`rankByClubId`, même source que le tableau des
// classements club-page-data.ts) plutôt qu'alphabétiquement — demande explicite
// de l'utilisateur : refléter l'ordre du classement dans ce menu, sans afficher
// le rang lui-même (juste l'ordre).
export function ClubSwitcher({
  currentClub,
  clubs,
  rankByClubId,
}: {
  currentClub: SwitcherClub;
  clubs: SwitcherClub[];
  rankByClubId: Record<string, number>;
}) {
  const t = useTranslations("clubs");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const orderedClubs = useMemo(
    () =>
      [...clubs].sort(
        (a, b) => (rankByClubId[a.id] ?? Infinity) - (rankByClubId[b.id] ?? Infinity)
      ),
    [clubs, rankByClubId]
  );

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

  // Verrouille le scroll de fond pendant que le panneau plein écran mobile est
  // ouvert (sans effet en desktop, le dropdown ne couvre pas la page).
  useEffect(() => {
    if (!open || !isMobile) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, isMobile]);

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
        !isMobile &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={t("detail.switchClub")}
            style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 100 }}
            className="pixel-corners-sm flex max-h-80 w-56 flex-col gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
          >
            {orderedClubs.map((c) => (
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

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isMobile && open && (
              <motion.div
                ref={menuRef}
                role="dialog"
                aria-modal="true"
                aria-label={t("detail.switchClub")}
                className="fixed inset-0 z-[200] flex flex-col bg-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="font-display text-base uppercase tracking-wide text-text">
                    {t("detail.switchClub")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={tNav("closeMenu")}
                    className="rounded-md p-2 text-text-muted transition-colors hover:text-text"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>

                <motion.div
                  className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {orderedClubs.map((c) => (
                    <motion.button
                      key={c.id}
                      variants={itemVariants}
                      type="button"
                      aria-current={c.id === currentClub.id ? "true" : undefined}
                      onClick={() => select(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-base transition-colors",
                        c.id === currentClub.id
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border text-text-muted hover:bg-border/20 hover:text-text"
                      )}
                    >
                      <ClubLogo club={c} size="md" />
                      {/* min-w-0 : en ligne flex, un enfant sans largeur contrainte
                          ne peut pas rétrécir sous sa taille de contenu par défaut
                          — `truncate` resterait sans effet sur un nom long sinon. */}
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
