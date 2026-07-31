"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
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
}: MatchesStripProps) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const title = titleOverride ?? (variant === "results" ? t("matchesStrip.results") : t("matchesStrip.upcoming"));
  const dateRange = formatGameweekRange(format, matches.map((m) => m.kickoffAt));
  const { logo, gridCols: responsiveGridCols, boxPad, outerGap } = SIZE_CONFIG[size];
  const gridCols = fixedColumns ? (fixedColumns === 2 ? "grid-cols-2" : "grid-cols-3") : responsiveGridCols;

  return (
    <div className="pixel-corners border border-border bg-surface px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{title}</p>
        {gameweekNumber !== null && (
          <p className="text-[10px] uppercase tracking-widest text-text-muted">
            {t("matchesStrip.gameweek", { number: gameweekNumber })}
            {dateRange && <span className="text-text-muted/70"> · {dateRange}</span>}
          </p>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">
          {variant === "results" ? t("matchesStrip.noResults") : t("matchesStrip.noUpcoming")}
        </p>
      ) : (
        <div className={`grid ${gridCols} ${outerGap}`}>
          {matches.map((m) => {
            const href = disableLink
              ? null
              : variant === "results"
                ? `/matches/${m.id}`
                : `/clubs/${m.homeClub.id}/vs/${m.awayClub.id}`;
            const hasScore = m.homeScore !== null && m.awayScore !== null;
            const logosRow = (
              <div className="flex items-center justify-center gap-0.5">
                <ClubLogo club={m.homeClub} size={logo} title={clubTooltip(m.homeClub)} />
                {hasScore && (
                  <span className="font-arcade text-sm tracking-wide text-text">
                    {m.homeScore}-{m.awayScore}
                  </span>
                )}
                <ClubLogo club={m.awayClub} size={logo} title={clubTooltip(m.awayClub)} />
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
            const boxClassName = `flex items-center justify-center gap-0.5 rounded-md border border-border/60 bg-bg transition-colors hover:border-accent/50 ${boxPad}`;

            return href ? (
              <Link key={m.id} href={href} className={boxClassName}>
                {content}
              </Link>
            ) : (
              <div key={m.id} className={boxClassName}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
