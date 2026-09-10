"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  DashboardIcon,
  MarketIcon,
  LeaguesIcon,
  LeaderboardIcon,
  TargetIcon,
  PitchIcon,
} from "@/components/ui/icons";

// "/team" est l'entrée principale : la vue terrain (ARCHITECTURE.md §8.1), l'écran
// le plus consulté. L'équipe active est résolue via le cookie activeLeagueId
// (src/lib/team/active-team-context.ts) — plus besoin de passer par /leagues, qui
// ne montre désormais que la ligue elle-même (classement, chat, invit).
// Pas d'entrée "Calendrier" : /matches est passée en mode Starligue (public),
// voir PublicNavBar.tsx — ces items sont désormais réservés au mode Fantasy
// (connexion requise).
// Exporté : réutilisé par MobileMenu.tsx (menu plein écran mobile) et
// FantasyTabBar.tsx (barre d'onglets basse mobile).
export const NAV_ITEMS = [
  { href: "/team", key: "team", Icon: PitchIcon },
  { href: "/market", key: "market", Icon: MarketIcon },
  { href: "/predictions", key: "predictions", Icon: TargetIcon },
  { href: "/leagues", key: "leagues", Icon: LeaguesIcon },
  { href: "/leaderboard", key: "leaderboard", Icon: LeaderboardIcon },
  { href: "/dashboard", key: "dashboard", Icon: DashboardIcon },
] as const;

// Sous-ensemble affiché dans la barre d'onglets basse sur mobile (FantasyTabBar).
// Les autres entrées (Pronos, Communauté) restent dans le menu hamburger.
export const MOBILE_TAB_KEYS = ["team", "market", "leagues", "leaderboard"] as const;

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
