// Types + registre des widgets du dashboard personnalisable (src/components/DashboardView.tsx).
// Aucun import Prisma. Les constantes sont pures ; `loadDashboardLayout`/
// `saveDashboardLayout` touchent localStorage (browser-only, no-op côté serveur) —
// même précédent que StatLeadersPanel : préférence purement UI, pas de modèle DB.

export type WidgetType =
  | "best-xi"
  | "leaderboard-global"
  | "leaderboard-leagues"
  | "last-results"
  | "upcoming-matches"
  | "club-standings"
  | "home-clubs-map"
  | "club-fantasy-ranking"
  | "player-stats";

// mini = compact (1 colonne), square = grand carré (2x2), wide = bande longue
// pleine largeur — voir DashboardView pour le mapping en classes de grille.
export type WidgetSize = "mini" | "square" | "wide";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  statKey?: string; // uniquement pour type === "player-stats"
}

// Ordre par défaut pensé pour un premier écran utile : ce qui concerne
// directement l'utilisateur (son classement, ses ligues) d'abord, la Starligue
// en général ensuite — plutôt que l'équipe type (souvent vide en tout début de
// saison) qui passait en premier auparavant.
export const SINGLETON_WIDGETS: { type: Exclude<WidgetType, "player-stats">; label: string }[] = [
  { type: "leaderboard-global", label: "Classement général" },
  { type: "leaderboard-leagues", label: "Mes ligues" },
  { type: "last-results", label: "Derniers résultats" },
  { type: "upcoming-matches", label: "Prochains matchs" },
  { type: "club-standings", label: "Classement Starligue" },
  { type: "best-xi", label: "Équipe type de la saison" },
  { type: "club-fantasy-ranking", label: "Classement des clubs" },
  { type: "home-clubs-map", label: "Carte des managers" },
];

// Taille de départ raisonnable par type — l'utilisateur peut la changer ensuite,
// c'est juste le point de départ le plus lisible pour chaque contenu (le terrain de
// l'équipe type a besoin de place, une bande de matchs est déjà horizontale, etc.)
const DEFAULT_SIZE_BY_TYPE: Record<WidgetType, WidgetSize> = {
  "best-xi": "wide",
  "leaderboard-global": "square",
  "leaderboard-leagues": "square",
  "last-results": "wide",
  "upcoming-matches": "wide",
  "club-standings": "wide",
  "home-clubs-map": "square",
  "club-fantasy-ranking": "square",
  "player-stats": "mini",
};

export function defaultSizeForType(type: WidgetType): WidgetSize {
  return DEFAULT_SIZE_BY_TYPE[type];
}

export const DEFAULT_LAYOUT: DashboardWidget[] = SINGLETON_WIDGETS.map((w) => ({
  id: w.type,
  type: w.type,
  size: defaultSizeForType(w.type),
}));

const STORAGE_KEY = "starligue:dashboardLayout";
const VALID_SIZES: WidgetSize[] = ["mini", "square", "wide"];

export function loadDashboardLayout(): DashboardWidget[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((w) => w && typeof w === "object" && typeof (w as DashboardWidget).id === "string" && typeof (w as DashboardWidget).type === "string")
    ) {
      // Rétro-compatibilité : layouts sauvegardés avant l'introduction des tailles
      // n'ont pas de champ `size` — on leur assigne la taille par défaut du type.
      return (parsed as DashboardWidget[]).map((w) => ({
        ...w,
        size: VALID_SIZES.includes(w.size) ? w.size : defaultSizeForType(w.type),
      }));
    }
  } catch {
    // localStorage corrompu — on garde les défauts
  }
  return DEFAULT_LAYOUT;
}

export function saveDashboardLayout(widgets: DashboardWidget[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}
