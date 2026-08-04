"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ClubPageMatch } from "@/lib/clubs/club-page-data";

interface SwitcherClub {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

interface ClubStandingSummary {
  rank: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
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

// Pastilles de forme (5 derniers matchs), en compact — même logique de couleur que
// ClubFormBadge (src/components/clubs/ClubFormBadge.tsx) mais réimplémentée ici :
// ce composant est un Server Component async (traductions serveur), impossible à
// réutiliser tel quel dans ce Client Component pour chaque ligne du menu.
function FormPastilles({ lastFive }: { lastFive: (ClubPageMatch | null)[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {lastFive.map((m, i) => {
        if (!m || m.ownScore === null || m.opponentScore === null) {
          return <span key={`empty-${i}`} className="h-1.5 w-1.5 rounded-full border border-border" />;
        }
        const result = m.ownScore > m.opponentScore ? "win" : m.ownScore < m.opponentScore ? "loss" : "draw";
        const tone = result === "win" ? "bg-points-pos" : result === "loss" ? "bg-points-neg" : "bg-accent-secondary";
        return <span key={m.id} className={cn("h-1.5 w-1.5 rounded-full", tone)} />;
      })}
    </div>
  );
}

// Ligne d'un club dans le menu (desktop ET mobile) : logo, nom, bilan V/N/D, forme
// et points au classement — demande explicite de l'utilisateur d'enrichir chaque
// ligne (pas juste le club courant) avec ces trois informations, points mis en
// évidence (même traitement visuel que le rang dans l'en-tête : accent-secondary +
// police arcade). `nameClassName` permet de réduire la police du nom sur mobile
// pour laisser plus de place à ces infos, sans toucher à la taille du logo (demande
// explicite : "ne touche pas à la taille du logo... réduis la police du nom").
function ClubRow({
  club,
  standing,
  lastFive,
  logoSize,
  nameClassName,
}: {
  club: SwitcherClub;
  standing: ClubStandingSummary | undefined;
  lastFive: (ClubPageMatch | null)[];
  logoSize: "sm" | "md";
  nameClassName: string;
}) {
  const tDash = useTranslations("dashboard");

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ClubLogo club={club} size={logoSize} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate", nameClassName)}>{club.name}</span>
          {standing && (
            <span className="shrink-0 font-arcade text-sm tracking-wide text-accent-secondary">
              {standing.points} {tDash("clubStandingsWidget.col.points")}
            </span>
          )}
        </div>
        {standing && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
            <span>
              {standing.wins}
              {tDash("clubStandingsWidget.col.wins")} · {standing.draws}
              {tDash("clubStandingsWidget.col.draws")} · {standing.losses}
              {tDash("clubStandingsWidget.col.losses")}
            </span>
            <FormPastilles lastFive={lastFive} />
          </div>
        )}
      </div>
    </div>
  );
}

// Bandeau d'en-tête club — toute la surface (logo + nom + badge, passés en
// children) ouvre un menu déroulant pour naviguer directement vers la page d'un
// autre club (demande explicite de l'utilisateur, page club /clubs/[id] ; d'abord
// limité au logo seul, puis étendu à toute la div). Menu monté via portal en
// position fixed, calée sur le getBoundingClientRect du bouton déclencheur — le
// conteneur d'en-tête (pixel-corners, clip-path) rognerait sinon un menu positionné
// en absolute (même piège déjà résolu pour PlayerSeasonRecapTrigger,
// src/components/players/PlayerSeasonRecapTrigger.tsx).
// `clubs` inclut le club courant (mis en évidence dans la liste plutôt qu'exclu —
// permet de voir en un coup d'œil "où je suis" dans la liste). Triée par
// classement Starligue courant (`standingsByClubId`, même source que le tableau des
// classements club-page-data.ts) plutôt qu'alphabétiquement — demande explicite
// de l'utilisateur : refléter l'ordre du classement dans ce menu. Chaque ligne
// affiche désormais aussi bilan/forme/points de CE club (pas seulement celui
// affiché en en-tête) — demande explicite de l'utilisateur.
export function ClubSwitcher({
  currentClub,
  clubs,
  standingsByClubId,
  formByClubId,
  children,
}: {
  currentClub: SwitcherClub;
  clubs: SwitcherClub[];
  standingsByClubId: Record<string, ClubStandingSummary>;
  formByClubId: Record<string, (ClubPageMatch | null)[]>;
  children?: ReactNode;
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
        (a, b) => (standingsByClubId[a.id]?.rank ?? Infinity) - (standingsByClubId[b.id]?.rank ?? Infinity)
      ),
    [clubs, standingsByClubId]
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
        className="flex w-full items-center gap-4 pixel-corners border border-border bg-surface p-4 text-left transition-colors hover:bg-border/10"
      >
        <ClubLogo club={currentClub} size="xl" largeOnDesktop className="shrink-0" />
        {children}
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
            className="pixel-corners-sm flex max-h-96 w-80 flex-col gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
          >
            {orderedClubs.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === currentClub.id}
                onClick={() => select(c.id)}
                className={`flex items-center rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  c.id === currentClub.id ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
                }`}
              >
                <ClubRow
                  club={c}
                  standing={standingsByClubId[c.id]}
                  lastFive={formByClubId[c.id] ?? []}
                  logoSize="sm"
                  nameClassName="text-sm"
                />
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
                        "flex w-full items-center rounded-lg border px-3 py-2.5 text-left transition-colors",
                        c.id === currentClub.id
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border text-text-muted hover:bg-border/20 hover:text-text"
                      )}
                    >
                      {/* Logo taille inchangée (demande explicite) ; police du nom
                          réduite (text-sm au lieu de text-base hérité) pour laisser
                          la place au bilan/forme/points sur la ligne du dessous. */}
                      <ClubRow
                        club={c}
                        standing={standingsByClubId[c.id]}
                        lastFive={formByClubId[c.id] ?? []}
                        logoSize="md"
                        nameClassName="text-sm"
                      />
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
