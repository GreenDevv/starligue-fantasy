"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PitchIcon, MarketIcon, PlayerIcon, RewindClockIcon, ChevronDownIcon } from "@/components/ui/icons";

interface League {
  id: string;
  name: string;
}

// Barre de sous-navigation de "Mon équipe" — rendue par (game)/team/layout.tsx.
// Se masque sur les wizards d'onboarding plein écran (/team/build, /team/start).
export function TeamSubnav({
  leagues,
  activeLeagueId,
  seasonStarted,
  mode,
}: {
  leagues: League[];
  activeLeagueId: string;
  seasonStarted: boolean;
  mode: "live" | "simulation";
}) {
  const t = useTranslations("team");
  const pathname = usePathname();

  if (pathname === "/team/build" || pathname === "/team/start") return null;

  const tabs = [
    { href: "/team", label: t("subnav.pitch"), Icon: PitchIcon, exact: true },
    { href: "/team/transfers", label: t("common.transfers"), Icon: MarketIcon },
    { href: "/team/trades", label: t("common.trades"), Icon: PlayerIcon },
    { href: "/team/history", label: t("common.backToHistory"), Icon: RewindClockIcon },
  ];

  const moreItems = [
    // Renommer : live uniquement (cf. TeamView, PUT /api/my-team/identity)
    ...(mode === "live" ? [{ href: "/team/identity", label: t("view.renameTeam") }] : []),
    ...(seasonStarted ? [] : [{ href: "/team/build", label: t("view.editSquad") }]),
  ];

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex flex-col gap-2">
      {leagues.length > 1 && (
        <LeagueContextSwitcher leagues={leagues} activeLeagueId={activeLeagueId} />
      )}

      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
        {tabs.map(({ href, label, Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent/10 text-accent shadow-glow-accent"
                  : "text-text-muted hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

        {moreItems.length > 0 && <MoreMenu items={moreItems} label={t("subnav.more")} />}
      </div>
    </div>
  );
}

function MoreMenu({ items, label }: { items: { href: string; label: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        {label}
        <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="pixel-corners-sm absolute right-0 top-full z-20 mt-1 min-w-[10rem] border border-border bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-text-muted transition-colors hover:bg-border/20 hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LeagueContextSwitcher({ leagues, activeLeagueId }: { leagues: League[]; activeLeagueId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);

  async function switchLeague(id: string) {
    if (id === activeLeagueId || switching) return;
    setSwitching(true);
    try {
      await fetch("/api/team/active-league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: id }),
      });
    } catch {
      // best-effort : le cookie sera retenté au prochain switch
    }
    router.push(`${pathname}?league=${id}`);
    router.refresh();
  }

  const t = useTranslations("team");
  return (
    <div className="pixel-corners-sm flex items-center gap-2 border border-border bg-surface/60 px-2 py-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
        {t("subnav.league")}
      </span>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
        {leagues.map((l) => (
          <button
            key={l.id}
            onClick={() => switchLeague(l.id)}
            disabled={switching}
            className={cn(
              "pixel-corners-sm shrink-0 px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors",
              l.id === activeLeagueId
                ? "bg-accent text-bg shadow-glow-accent"
                : "border border-border text-text-muted hover:text-text"
            )}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}
