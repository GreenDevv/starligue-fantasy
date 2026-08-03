"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "@/components/NavBar";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { LOCALE_NAME } from "@/components/LocaleSwitcher";
import { SeasonToggle } from "@/components/SeasonToggle";
import { MenuIcon, CloseIcon, LogoutIcon } from "@/components/ui/icons";
import type { SeasonMode } from "@/lib/team/active-team-context";

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// Menu mobile plein écran — remplace, sous sm:, à la fois l'ancienne
// MobileTabBar (barre fixe du bas, 6 onglets trop serrés) ET les icônes du
// header (SeasonToggle/Compte/LocaleSwitcher/AuthButton) qui s'entassaient sur
// mobile. Demande explicite de l'utilisateur : "tout regrouper dans un seul
// menu" plutôt que garder plusieurs zones de navigation séparées. Desktop
// inchangé (le déclencheur est sm:hidden, le header classique reste sm:flex
// dans GameLayout).
export function MobileMenu({
  userName,
  isAdmin,
  seasonMode,
}: {
  userName?: string | null;
  isAdmin: boolean;
  seasonMode: SeasonMode;
}) {
  const t = useTranslations("nav");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Ferme automatiquement à toute navigation (lien cliqué, bouton retour du
  // navigateur, etc.) — évite un menu plein écran qui reste ouvert par-dessus
  // la nouvelle page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectLocale(nextLocale: AppLocale) {
    setOpen(false);
    if (nextLocale === locale) return;
    router.replace({ pathname, query: Object.fromEntries(searchParams) }, { locale: nextLocale });
  }

  function handleLogout() {
    setOpen(false);
    signOut({ callbackUrl: `/${locale}/login` });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-md p-2 text-text-muted transition-colors hover:text-text sm:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={t("openMenu")}
                className="fixed inset-0 z-[200] flex flex-col bg-bg sm:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="font-display text-base uppercase tracking-widest text-accent">
                    Starligue Fantasy
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("closeMenu")}
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
                  {NAV_ITEMS.map(({ href, key, Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <motion.div key={href} variants={itemVariants}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition-colors",
                            active ? "bg-accent/10 text-accent shadow-glow-accent" : "text-text hover:bg-border/20"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {t(key)}
                        </Link>
                      </motion.div>
                    );
                  })}

                  <motion.div variants={itemVariants} className="my-2 border-t border-border" />

                  {userName && (
                    <motion.div variants={itemVariants}>
                      <Link
                        href="/account"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-text-muted transition-colors hover:bg-border/20 hover:text-text"
                      >
                        {t("account")}
                      </Link>
                    </motion.div>
                  )}

                  {isAdmin && (
                    <motion.div variants={itemVariants} className="px-3 py-2">
                      <SeasonToggle initialMode={seasonMode} />
                    </motion.div>
                  )}

                  <motion.div variants={itemVariants} className="px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
                      {t("languageSelector")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {routing.locales.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => selectLocale(l)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                            l === locale
                              ? "border-accent/50 bg-accent/10 text-accent"
                              : "border-border text-text-muted hover:text-text"
                          )}
                        >
                          <FlagIcon locale={l} />
                          {LOCALE_NAME[l]}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div variants={itemVariants} className="mt-auto border-t border-border pt-3">
                    {userName ? (
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base text-text-muted transition-colors hover:text-points-neg"
                      >
                        <LogoutIcon className="h-5 w-5" />
                        {t("deconnexion")}
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-accent"
                      >
                        {t("connexion")}
                      </Link>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
