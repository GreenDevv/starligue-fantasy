"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, MOBILE_TAB_KEYS, isActive } from "@/components/NavBar";

// Barre d'onglets basse — mobile uniquement (sm:hidden). Les 4 destinations
// principales du jeu à un pouce (usage dimanche soir). Le menu hamburger
// (MobileMenu) garde le reste : Pronos, Communauté, compte, saison, langue.
// Se masque sur les wizards d'onboarding plein écran, comme <TeamSubnav>.
const TAB_ITEMS = NAV_ITEMS.filter((i) =>
  (MOBILE_TAB_KEYS as readonly string[]).includes(i.key)
);

export function FantasyTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  if (pathname === "/team/build" || pathname === "/team/start") return null;

  return (
    <nav
      aria-label={t("openMenu")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      {TAB_ITEMS.map(({ href, key, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium uppercase tracking-wide transition-colors",
              active ? "text-accent" : "text-text-muted"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_currentColor]")} />
            <span className="max-w-full truncate">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
