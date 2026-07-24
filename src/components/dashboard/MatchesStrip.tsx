import Link from "next/link";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { WidgetSize } from "@/lib/dashboard/layout";

interface StripClub {
  id: string;
  shortName: string;
  name?: string;
  logoUrl?: string | null;
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
}

// Même design que "wide", réduit à l'échelle pour "square"/"mini" (widget dashboard
// redimensionnable) — colonnes de grille bornées à la largeur réelle du widget,
// plutôt que des breakpoints viewport qui déborderaient dans un widget étroit.
const SIZE_CONFIG: Record<WidgetSize, { logo: "xs" | "sm" | "md" | "lg"; gridCols: string; boxPad: string; outerGap: string }> = {
  mini: { logo: "xs", gridCols: "grid-cols-2", boxPad: "px-1 py-1", outerGap: "gap-1" },
  square: { logo: "sm", gridCols: "grid-cols-2 sm:grid-cols-3", boxPad: "px-1.5 py-1.5", outerGap: "gap-1.5" },
  wide: { logo: "lg", gridCols: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4", boxPad: "px-1.5 py-1.5", outerGap: "gap-2" },
};

function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// Plage de dates couvrant toute la journée (ex: "13-14 déc.") plutôt que la date de
// chaque match individuel — les matchs d'une même journée s'étalent sur 2-3 jours.
function formatGameweekRange(dates: (string | Date)[]): string | null {
  if (dates.length === 0) return null;
  const parsed = dates.map((d) => (typeof d === "string" ? new Date(d) : d)).sort((a, b) => a.getTime() - b.getTime());
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (!first || !last) return null;

  if (first.toDateString() === last.toDateString()) {
    return formatDayMonth(first);
  }
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (sameMonth) {
    return `${first.getDate()}-${formatDayMonth(last)}`;
  }
  return `${formatDayMonth(first)} - ${formatDayMonth(last)}`;
}

// Bandeau compact "résultats dernière journée" / "prochains matchs" — logos club
// uniquement (pas de nom complet), grille qui s'enroule pour montrer toute la
// journée sans scroll. Réutilisé par TeamView (saison 2026/27) et SimulationView
// (2025/26) — ARCHITECTURE.md §8.1.
export function MatchesStrip({ variant, gameweekNumber, matches, size = "wide", fixedColumns }: MatchesStripProps) {
  const title = variant === "results" ? "Résultats" : "Prochains matchs";
  const dateRange = formatGameweekRange(matches.map((m) => m.kickoffAt));
  const { logo, gridCols: responsiveGridCols, boxPad, outerGap } = SIZE_CONFIG[size];
  const gridCols = fixedColumns ? (fixedColumns === 2 ? "grid-cols-2" : "grid-cols-3") : responsiveGridCols;

  return (
    <div className="pixel-corners border border-border bg-surface px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{title}</p>
        {gameweekNumber !== null && (
          <p className="text-[10px] uppercase tracking-widest text-text-muted">
            Journée {gameweekNumber}
            {dateRange && <span className="text-text-muted/70"> · {dateRange}</span>}
          </p>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">
          {variant === "results" ? "Aucun résultat pour l'instant." : "Aucun match programmé."}
        </p>
      ) : (
        <div className={`grid ${gridCols} ${outerGap}`}>
          {matches.map((m) => (
            <Link
              key={m.id}
              href={variant === "results" ? `/matches/${m.id}` : `/clubs/${m.homeClub.id}/vs/${m.awayClub.id}`}
              className={`flex items-center justify-center gap-0.5 rounded-md border border-border/60 bg-bg transition-colors hover:border-accent/50 ${boxPad}`}
            >
              <ClubLogo club={m.homeClub} size={logo} />
              {variant === "results" && (
                <span className="font-arcade text-sm tracking-wide text-text">
                  {m.homeScore ?? "–"}-{m.awayScore ?? "–"}
                </span>
              )}
              <ClubLogo club={m.awayClub} size={logo} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
