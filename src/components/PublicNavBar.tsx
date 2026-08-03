"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { isActive } from "@/components/NavBar";
import { CalendarIcon, PlayerIcon, StatisticianIcon } from "@/components/ui/icons";

// Nav du mode Starligue (public) — pas d'entrée "Accueil" séparée, le logo
// (Link vers "/") en tient déjà lieu. Pas d'entrée "Clubs" : /clubs n'a pas de
// page d'index (uniquement /clubs/[id]), on y accède via les logos club sur la
// home/le classement, comme aujourd'hui.
export const PUBLIC_NAV_ITEMS = [
  { href: "/matches", key: "matches", Icon: CalendarIcon },
  { href: "/players", key: "players", Icon: PlayerIcon },
  { href: "/stats", key: "stats", Icon: StatisticianIcon },
] as const;

export function PublicNavBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <div className="hidden items-center gap-0.5 sm:flex xl:gap-1">
      {PUBLIC_NAV_ITEMS.map(({ href, key, Icon }) => {
        const active = isActive(pathname, href);
        const label = t(key);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors xl:px-2.5",
              active ? "bg-accent/10 text-accent shadow-glow-accent" : "text-text-muted hover:text-text"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden xl:inline">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
