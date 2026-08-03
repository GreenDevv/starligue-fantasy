"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { FlagIcon } from "@/components/ui/FlagIcon";

// Noms natifs (pas de traduction croisée : chaque langue s'affiche dans sa
// propre langue, convention standard des sélecteurs de langue). Exporté :
// réutilisé par MobileMenu.tsx (sélecteur de langue inline plein écran).
export const LOCALE_NAME: Record<AppLocale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  ca: "Català",
  de: "Deutsch",
  pt: "Português",
  da: "Dansk",
  pl: "Polski",
};

export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  function select(nextLocale: AppLocale) {
    setOpen(false);
    if (nextLocale === locale) return;
    router.replace(
      { pathname, query: Object.fromEntries(searchParams) },
      { locale: nextLocale }
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("languageSelector")}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        <FlagIcon locale={locale} />
        <span className="hidden xl:inline">{locale.toUpperCase()}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("languageSelector")}
          className="pixel-corners-sm absolute right-0 top-full z-30 mt-1 flex max-h-80 min-w-[9rem] flex-col gap-0.5 overflow-y-auto border border-border bg-surface p-1 shadow-lg"
        >
          {routing.locales.map((l) => (
            <button
              key={l}
              type="button"
              role="option"
              aria-selected={l === locale}
              onClick={() => select(l)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                l === locale ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-border/20 hover:text-text"
              }`}
            >
              <FlagIcon locale={l} />
              {LOCALE_NAME[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
