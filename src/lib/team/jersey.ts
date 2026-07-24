// Modèle du kit personnalisable (maillot + short + chaussettes) — ARCHITECTURE.md
// §5.x. Stocké en Json sur FantasyTeam.jerseyConfig (pas de @default DB,
// toujours fourni à la création, même convention que FantasyLineup.entries).
// Le champ Prisma/API garde le nom historique `jerseyConfig` pour éviter de
// toucher tous ses consommateurs (voir ARCHITECTURE.md) — seule sa forme
// interne a changé (3 zones au lieu d'un unique jeu de couleurs/motif).
import { z } from "zod";
import { getPattern, DEFAULT_PATTERN_ID } from "./kitPatterns";

export const JERSEY_COLLARS = ["crew", "v-neck", "polo"] as const;
export type JerseyCollar = (typeof JERSEY_COLLARS)[number];

export const KIT_ZONES = ["jersey", "shorts", "socks"] as const;
export type KitZoneName = (typeof KIT_ZONES)[number];

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hex invalide");

export const kitZoneSchema = z.object({
  patternId: z.string(),
  colors: z.array(hex).min(1).max(4),
});
export type KitZone = z.infer<typeof kitZoneSchema>;

export const jerseyConfigSchema = z.object({
  jersey: kitZoneSchema,
  shorts: kitZoneSchema,
  socks: kitZoneSchema,
  collar: z.enum(JERSEY_COLLARS),
  // Couleur du col et des manches contrastées — partagée par le maillot
  // uniquement (short/chaussettes n'ont pas de "col").
  trimColor: hex,
  contrastSleeves: z.boolean(),
  number: z.number().int().min(0).max(99),
  nameFlock: z.string().trim().max(12).optional().default(""),
});

export type JerseyConfig = z.infer<typeof jerseyConfigSchema>;

export const DEFAULT_JERSEY_CONFIG: JerseyConfig = {
  jersey: { patternId: DEFAULT_PATTERN_ID, colors: ["#2DD4BF", "#0E1116"] },
  shorts: { patternId: DEFAULT_PATTERN_ID, colors: ["#0E1116"] },
  socks: { patternId: DEFAULT_PATTERN_ID, colors: ["#0E1116"] },
  collar: "crew",
  trimColor: "#F59E0B",
  contrastSleeves: false,
  number: 1,
  nameFlock: "",
};

// Palette curatée : tokens de marque (teal/ambre en tête) + couleurs de maillot classiques.
export const CURATED_JERSEY_SWATCHES: string[] = [
  "#2DD4BF", "#F59E0B", "#0E1116", "#F1F5F9", "#F87171", "#34D399",
  "#38BDF8", "#A78BFA", "#FB923C", "#1D4ED8", "#166534", "#7C2D12",
];

/** Couleur résolue pour une région de motif, avec repli défensif. */
export function zoneColor(zone: KitZone, slot: number): string {
  return zone.colors[slot] ?? zone.colors[0] ?? "#2DD4BF";
}

export function zonePattern(zone: KitZone) {
  return getPattern(zone.patternId);
}

// --- Rétrocompatibilité avec l'ancien format (avant l'introduction des zones
// jersey/shorts/socks et du registre de motifs élargi) ---

interface LegacyJerseyConfig {
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  pattern?: string;
  collar?: string;
  contrastSleeves?: boolean;
  number?: number;
  nameFlock?: string;
}

const LEGACY_PATTERN_MAP: Record<string, string> = {
  solid: "solid",
  stripes: "stripes-4",
  hoops: "hoops-4",
  sash: "sash-thin",
  halves: "halves-vertical",
};

function migrateLegacyConfig(legacy: LegacyJerseyConfig): unknown {
  const primary = legacy.primaryColor ?? DEFAULT_JERSEY_CONFIG.jersey.colors[0];
  const secondary = legacy.secondaryColor ?? primary;
  const patternId = (legacy.pattern && LEGACY_PATTERN_MAP[legacy.pattern]) ?? DEFAULT_PATTERN_ID;
  return {
    jersey: { patternId, colors: [primary, secondary] },
    shorts: { patternId: DEFAULT_PATTERN_ID, colors: [primary] },
    socks: { patternId: DEFAULT_PATTERN_ID, colors: [primary] },
    collar: legacy.collar ?? "crew",
    trimColor: legacy.tertiaryColor ?? DEFAULT_JERSEY_CONFIG.trimColor,
    contrastSleeves: legacy.contrastSleeves ?? false,
    number: legacy.number ?? 1,
    nameFlock: legacy.nameFlock ?? "",
  };
}

// Parse défensif pour l'affichage — un jerseyConfig malformé/legacy ne doit
// jamais faire planter le rendu (Json n'a pas de validation native côté DB).
export function safeJerseyConfig(raw: unknown): JerseyConfig {
  const direct = jerseyConfigSchema.safeParse(raw);
  if (direct.success) return direct.data;

  if (raw && typeof raw === "object" && "primaryColor" in raw) {
    const migrated = jerseyConfigSchema.safeParse(migrateLegacyConfig(raw as LegacyJerseyConfig));
    if (migrated.success) return migrated.data;
  }

  return DEFAULT_JERSEY_CONFIG;
}
