"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  DashboardIcon,
  MarketIcon,
  LeaguesIcon,
  LeaderboardIcon,
  CalendarIcon,
  TargetIcon,
} from "@/components/ui/icons";

// Pas d'entrée "Équipe" séparée : une équipe fantasy n'existe qu'à l'intérieur
// d'une ligue (FantasyTeam.leagueId jamais optionnel) — /leagues est le point
// d'entrée, cliquer sur une ligue affiche l'équipe qui lui est associée
// (src/app/[locale]/(game)/leagues/[id]/page.tsx).
// Exporté : réutilisé par MobileMenu.tsx (menu plein écran mobile, remplace
// l'ancienne MobileTabBar — demande explicite de l'utilisateur de tout
// regrouper dans un seul menu hamburger plutôt que garder une barre du bas).
export const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", Icon: DashboardIcon },
  { href: "/market", key: "market", Icon: MarketIcon },
  { href: "/predictions", key: "predictions", Icon: TargetIcon },
  { href: "/leagues", key: "leagues", Icon: LeaguesIcon },
  { href: "/leaderboard", key: "leaderboard", Icon: LeaderboardIcon },
  { href: "/matches", key: "matches", Icon: CalendarIcon },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Nav desktop (barre du haut) — ARCHITECTURE.md §8 mobile-first. Icône seule
// entre sm et xl (pas assez de place pour les libellés à côté du logo/toggle/
// auth dans le header), texte+icône à partir de xl.
export function NavBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <div className="hidden items-center gap-0.5 sm:flex xl:gap-1">
      {NAV_ITEMS.map(({ href, key, Icon }) => {
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
