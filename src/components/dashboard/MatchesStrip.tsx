"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { GameweekDropdown } from "@/components/dashboard/GameweekDropdown";
import type { WidgetSize } from "@/lib/dashboard/layout";

interface StripClub {
  // Absent pour un club hors DB (pas de page /clubs/[id] à lier) — voir linkHref.
  id?: string;
  shortName: string;
  name?: string;
  logoUrl?: string | null;
  // Renseigné seulement pour un club hors DB (ex: adversaire Warm Up de D2/étranger,
  // ARCHITECTURE.md §19) — affiché en info-bulle au survol du logo. Jamais pour un
  // club Daikin StarLigue connu (n'affecte aucun usage existant : absent partout
  // ailleurs).
  division?: string | null;
}

interface StripMatch {
  id: string;
  homeClub: StripClub;
  awayClub: StripClub;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: string | Date;
  // URL personnalisée pour CE match précis (ex: page groupe EHF depuis la home,
  // /matches/ehf/[competition]/[group]) — prioritaire sur `disableLink` et sur la
  // résolution par défaut (/matches/[id] ou /clubs/.../vs/...). Chaîne (pas une
  // fonction) : ce composant est un Client Component, une fonction passée depuis
  // une page serveur ne serait pas sérialisable à travers la frontière RSC.
  href?: string;
  // Diffuseur TV officiel (ARCHITECTURE.md §4.2, lnh.fr) — badge cliquable en coin
  // de l'encart, en plus du lien principal (pas à sa place : deux liens différents,
  // affichés comme deux éléments frères plutôt qu'imbriqués). Champs à plat (plutôt
  // qu'un seul objet `{name,url}`) pour correspondre exactement à la forme de
  // DashboardStripMatch (src/lib/matches/dashboard-strips.ts) et être passable telle
  // quelle sans mapping, comme le fait déjà la home pour le strip championnat.
  // Absents par défaut : n'affectent aucun strip existant (Warm Up/Coupe de
  // France/EHF/résultats, où lnh.fr n'expose pas cette info ou n'a plus d'intérêt
  // pour un match déjà joué).
  broadcasterName?: string | null;
  broadcasterUrl?: string | null;
}

interface MatchesStripProps {
  variant: "results" | "upcoming";
  gameweekNumber: number | null;
  matches: StripMatch[];
  size?: WidgetSize; // widget dashboard redimensionnable — même design, à l'échelle
  // Le SIZE_CONFIG "wide"/"square" escalade le nb de colonnes via des breakpoints
  // sm:/md: liés à la largeur du VIEWPORT — correct pour un widget dashboard qui
  // occupe toute la largeur, faux dès que le conteneur réel est plus étroit (ex:
  // TeamView affiche 2 strips côte à côte dans une page bornée à max-w-2xl : sur
  // desktop le viewport déclenche sm:/md: alors que chaque strip ne fait que
  // ~300px, d'où le débordement/clipping des logos). Un nombre de colonnes fixe
  // (non lié au viewport) contourne ça pour ces usages en conteneur étroit connu.
  fixedColumns?: 2 | 3;
  // Titre affiché à la place de "Résultats"/"Prochains matchs" (ex: "Warm Up" pour
  // une liste qui mélange les deux, ARCHITECTURE.md §19). Sans effet sur l'usage
  // championnat existant si omis.
  title?: string;
  // true : rend un simple encart sans lien au lieu du lien par défaut (/matches/[id]
  // ou /clubs/[id]/vs/[id]) — ex: matchs Warm Up (ARCHITECTURE.md §19), dont les
  // clubs hors DB n'ont pas de page /clubs/[id]. Prop booléenne (pas une fonction) :
  // ce composant est un Client Component, une fonction passée depuis une page
  // serveur ne serait pas sérialisable à travers la frontière RSC. Sans effet sur
  // l'usage championnat existant si omis.
  disableLink?: boolean;
  // Affiche la date+heure du match dans l'encart (au-dessus des logos, sans changer
  // leur taille) plutôt qu'en info-bulle seulement — utile quand les matchs d'une
  // même liste n'ont pas tous la même date (ex: Warm Up, ARCHITECTURE.md §19,
  // contrairement au championnat où le range de dates de la journée est déjà dans
  // l'en-tête). Sans effet sur l'usage championnat existant si omis.
  showDate?: boolean;
  // "highlight" : encart teinté accent (au lieu du gris bg-surface par défaut) pour
  // le faire ressortir visuellement dans une pile d'encarts similaires (ex:
  // "prochains matchs" sur la home, pour le distinguer des résultats). Purement
  // visuel, aucun effet sur le comportement.
  tone?: "default" | "highlight";
  // Position au classement Starligue par clubId — affichée discrètement entre
  // parenthèses sous chaque logo (demande explicite de l'utilisateur). Absent par
  // défaut : n'affecte aucun usage existant (Warm Up/Coupe de France/EHF, où les
  // clubs n'ont pas forcément d'id DB ni de classement Starligue pertinent).
  rankByClubId?: Record<string, number>;
  // Dropdown de navigation par journée (remplace le simple libellé "Journée N" par
  // un bouton ouvrant la liste de toutes les journées) — demande explicite de
  // l'utilisateur, seulement câblée sur le strip "prochains matchs" de la home.
  // Absent par défaut : le libellé reste un texte simple partout ailleurs.
  gameweekNav?: { total: number; hrefBase: string };
  // true : le contenu (grille de matchs) devient un tiroir ouvrable/fermable via un
  // chevron dédié dans l'en-tête (bouton séparé du gameweekNav pour éviter un
  // bouton imbriqué dans un bouton) — demande explicite de l'utilisateur, câblée
  // uniquement sur les 5 strips "matchs" de la home (ARCHITECTURE.md §16/§19).
  // Sans effet sur l'usage championnat des autres pages (club/team/simulation) si
  // omis : le contenu reste toujours affiché comme aujourd'hui.
  collapsible?: boolean;
  // État initial du tiroir si collapsible est vrai (défaut : ouvert). La home
  // l'utilise à false pour les 5 strips concernés (demande explicite).
  defaultOpen?: boolean;
}

// Même design que "wide", réduit à l'échelle pour "square"/"mini" (widget dashboard
// redimensionnable) — colonnes de grille bornées à la largeur réelle du widget,
// plutôt que des breakpoints viewport qui déborderaient dans un widget étroit.
const SIZE_CONFIG: Record<WidgetSize, { logo: "xs" | "sm" | "md" | "lg"; gridCols: string; boxPad: string; outerGap: string }> = {
  mini: { logo: "xs", gridCols: "grid-cols-2", boxPad: "px-1 py-1", outerGap: "gap-1" },
  square: { logo: "sm", gridCols: "grid-cols-2 sm:grid-cols-3", boxPad: "px-1.5 py-1.5", outerGap: "gap-1.5" },
  wide: { logo: "lg", gridCols: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4", boxPad: "px-1.5 py-1.5", outerGap: "gap-2" },
};

type DateFormatter = ReturnType<typeof useFormatter>;

function formatDayMonth(format: DateFormatter, date: Date): string {
  return format.dateTime(date, { day: "2-digit", month: "short" });
}

// Plage de dates couvrant toute la journée (ex: "13-14 déc.") plutôt que la date de
// chaque match individuel — les matchs d'une même journée s'étalent sur 2-3 jours.
function formatGameweekRange(format: DateFormatter, dates: (string | Date)[]): string | null {
  if (dates.length === 0) return null;
  const parsed = dates.map((d) => (typeof d === "string" ? new Date(d) : d)).sort((a, b) => a.getTime() - b.getTime());
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (!first || !last) return null;

  if (first.toDateString() === last.toDateString()) {
    return formatDayMonth(format, first);
  }
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (sameMonth) {
    return `${first.getDate()}-${formatDayMonth(format, last)}`;
  }
  return `${formatDayMonth(format, first)} - ${formatDayMonth(format, last)}`;
}

// Bandeau compact "résultats dernière journée" / "prochains matchs" — logos club
// uniquement (pas de nom complet), grille qui s'enroule pour montrer toute la
// journée sans scroll. Réutilisé par TeamView (saison 2026/27) et SimulationView
// (2025/26) — ARCHITECTURE.md §8.1.
function clubTooltip(club: StripClub): string | undefined {
  if (!club.division) return undefined;
  return `${club.name ?? club.shortName} (${club.division})`;
}

export function MatchesStrip({
  variant,
  gameweekNumber,
  matches,
  size = "wide",
  fixedColumns,
  title: titleOverride,
  disableLink,
  showDate,
  tone = "default",
  rankByClubId,
  gameweekNav,
  collapsible,
  defaultOpen = true,
}: MatchesStripProps) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const [open, setOpen] = useState(defaultOpen);
  const title = titleOverride ?? (variant === "results" ? t("matchesStrip.results") : t("matchesStrip.upcoming"));
  const dateRange = formatGameweekRange(format, matches.map((m) => m.kickoffAt));
  const { logo, gridCols: responsiveGridCols, boxPad, outerGap } = SIZE_CONFIG[size];
  const gridCols = fixedColumns ? (fixedColumns === 2 ? "grid-cols-2" : "grid-cols-3") : responsiveGridCols;
  const containerTone = tone === "highlight" ? "border-accent/40 bg-accent/10" : "border-border bg-surface";
  const isOpen = !collapsible || open;

  const body = (
    <>
      {matches.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">
          {variant === "results" ? t("matchesStrip.noResults") : t("matchesStrip.noUpcoming")}
        </p>
      ) : (
        <div className={`grid ${gridCols} ${outerGap}`}>
          {matches.map((m) => {
            const href =
              m.href ??
              (disableLink
                ? null
                : variant === "results"
                  ? `/matches/${m.id}`
                  : `/clubs/${m.homeClub.id}/vs/${m.awayClub.id}`);
            const hasScore = m.homeScore !== null && m.awayScore !== null;
            const homeRank = m.homeClub.id ? rankByClubId?.[m.homeClub.id] : undefined;
            const awayRank = m.awayClub.id ? rankByClubId?.[m.awayClub.id] : undefined;
            const logosRow = (
              <div className="flex items-center justify-center gap-1">
                <div className="flex flex-col items-center gap-0.5">
                  <ClubLogo club={m.homeClub} size={logo} title={clubTooltip(m.homeClub)} />
                  {homeRank !== undefined && (
                    <span className="text-[8px] leading-none text-text-muted/70">({homeRank})</span>
                  )}
                </div>
                {hasScore && (
                  <span className="font-arcade text-sm tracking-wide text-text">
                    {m.homeScore}-{m.awayScore}
                  </span>
                )}
                <div className="flex flex-col items-center gap-0.5">
                  <ClubLogo club={m.awayClub} size={logo} title={clubTooltip(m.awayClub)} />
                  {awayRank !== undefined && (
                    <span className="text-[8px] leading-none text-text-muted/70">({awayRank})</span>
                  )}
                </div>
              </div>
            );
            const content = showDate ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] uppercase leading-none tracking-wide text-text-muted">
                  {formatDayMonth(format, new Date(m.kickoffAt))}{" "}
                  {format.dateTime(new Date(m.kickoffAt), { hour: "2-digit", minute: "2-digit" })}
                </span>
                {logosRow}
              </div>
            ) : (
              logosRow
            );
            const boxClassName = `relative flex items-center justify-center gap-0.5 rounded-md border border-border/60 bg-bg transition-colors hover:border-accent/50 ${boxPad}`;
            const box = href ? (
              <Link key={m.id} href={href} className={boxClassName}>
                {content}
              </Link>
            ) : (
              <div key={m.id} className={boxClassName}>
                {content}
              </div>
            );

            if (!m.broadcasterName || !m.broadcasterUrl) return box;
            // Badge frère (pas imbriqué dans le Link ci-dessus, un <a> dans un <a>
            // serait invalide) positionné en coin — lien indépendant vers le
            // diffuseur, distinct du lien principal de l'encart.
            return (
              <div key={m.id} className="relative">
                {box}
                <a
                  href={m.broadcasterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={m.broadcasterName}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2 w-2">
                    <rect x="3" y="7" width="18" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className={`pixel-corners border px-3 py-2.5 ${containerTone}`}>
      <div className={isOpen ? "mb-2 flex items-center justify-between" : "flex items-center justify-between"}>
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-text-muted">{title}</p>
          {collapsible && !isOpen && matches.length > 0 && (
            <span className="text-[10px] text-text-muted/60">({matches.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {gameweekNumber !== null &&
            (gameweekNav ? (
              <div className="flex items-center gap-1">
                <GameweekDropdown
                  current={gameweekNumber}
                  total={gameweekNav.total}
                  hrefBase={gameweekNav.hrefBase}
                  label={t("matchesStrip.gameweek", { number: gameweekNumber })}
                />
                {dateRange && <span className="text-[10px] text-text-muted/70">· {dateRange}</span>}
              </div>
            ) : (
              <p className="text-[10px] uppercase tracking-widest text-text-muted">
                {t("matchesStrip.gameweek", { number: gameweekNumber })}
                {dateRange && <span className="text-text-muted/70"> · {dateRange}</span>}
              </p>
            ))}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={isOpen}
              aria-label={isOpen ? t("matchesStrip.collapse") : t("matchesStrip.expand")}
              className="text-text-muted transition-colors hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {collapsible ? (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        body
      )}
    </div>
  );
}
