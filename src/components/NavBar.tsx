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
const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", Icon: DashboardIcon },
  { href: "/market", key: "market", Icon: MarketIcon },
  { href: "/predictions", key: "predictions", Icon: TargetIcon },
  { href: "/leagues", key: "leagues", Icon: LeaguesIcon },
  { href: "/leaderboard", key: "leaderboard", Icon: LeaderboardIcon },
  { href: "/matches", key: "matches", Icon: CalendarIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
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

// Tab bar mobile fixe en bas façon panneau de contrôle borne d'arcade — DOIT être
// rendue en dehors de tout ancêtre avec backdrop-filter/filter/transform (ex: le
// <nav> sticky du header a backdrop-blur-sm), sans quoi cet ancêtre devient le
// containing block du `fixed` et la barre se retrouve collée sous lui au lieu du
// bas de l'écran. Rendue directement au niveau racine du layout, pas depuis
// l'intérieur du header.
export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-accent/20 bg-surface/95 shadow-[0_-1px_12px_rgba(45,212,191,0.12)] backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-6">
        {NAV_ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] uppercase tracking-wide transition-colors",
                active ? "text-accent drop-shadow-[0_0_6px_rgba(45,212,191,0.7)]" : "text-text-muted"
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-6 rounded-full bg-accent shadow-glow-accent" />
              )}
              <Icon className="h-5 w-5" strokeWidth={active ? 2.1 : 1.8} />
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
