// Compare les stats de match déjà enregistrées (PlayerMatchStat) avec ce que
// lnh.fr renvoie aujourd'hui, pour repérer les corrections que la LNH publie 2-3
// jours après les matchs (notes de performance surtout, mais aussi les 13 stats
// détaillées de boxscore — src/lib/stats/stat-lines.ts).
//
// Fonctions pures, testées (diff.test.ts). L'orchestration (scraping, chargement
// DB, application) est dans analyze.ts / apply.ts.

// Champs de PlayerMatchStat issus du scraping lnh.fr (cf. boxscoreRowToStatFields
// dans src/lib/data-providers/lnh-scraper.provider.ts). `source`/`updatedAt` exclus
// (métadonnées, jamais une "correction"). `played` inclus : la LNH corrige parfois
// un joueur passé de 0 à quelques minutes (ou l'inverse).
export const CORRECTABLE_FIELDS = [
  "lnhRating",
  "played",
  "saves",
  "shotsFaced",
  "savePercentage",
  "goalsPlay",
  "shotsPlay",
  "goalsPenalty",
  "shotsPenalty",
  "goalsTotal",
  "shotsTotal",
  "shotPercentage",
  "assists",
  "ballsRecovered",
  "opponentShotsBlocked",
  "penaltiesDrawn",
  "twoMinDrawn",
  "neutralizations",
  "turnovers",
  "twoMinTaken",
  "disqualified",
] as const;

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

/** Note LNH + stats détaillées à mi-chemin entre "row scrapée" et "PlayerMatchStat". */
export type StatFields = Partial<Record<CorrectableField, unknown>>;

export type FieldValue = number | boolean | null;

export interface FieldChange {
  field: CorrectableField;
  before: FieldValue;
  after: FieldValue;
}

export interface StatCorrection {
  /** `${matchId}:${playerId}` — identifiant stable d'une correction, coché/décoché en UI. */
  key: string;
  matchId: string;
  playerId: string;
  changes: FieldChange[];
  /** Raccourci : la note LNH elle-même a-t-elle changé (le cas qui parle aux managers). */
  ratingChanged: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export function correctionKey(matchId: string, playerId: string): string {
  return `${matchId}:${playerId}`;
}

// lnhRating/shotPercentage/savePercentage sont des Prisma.Decimal en base (objet)
// mais des number après scraping ; les entiers peuvent arriver en string via une
// route JSON. On ramène tout à number | boolean | null pour comparer.
export function normalizeValue(v: unknown): FieldValue {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  }
  // Prisma.Decimal et assimilés : String(x) === "6.5"
  const n = Number(String(v));
  return Number.isNaN(n) ? null : n;
}

function valuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return a === b;
}

/**
 * Écarts champ par champ entre une stat enregistrée et une stat fraîchement
 * scrapée. `null` des deux côtés (ou absent) → pas un écart.
 */
export function diffStatFields(stored: StatFields, scraped: StatFields): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of CORRECTABLE_FIELDS) {
    const before = normalizeValue(stored[field]);
    const after = normalizeValue(scraped[field]);
    if (!valuesEqual(before, after)) {
      changes.push({ field, before, after });
    }
  }
  return changes;
}

export interface StoredStatRow extends StatFields {
  matchId: string;
  playerId: string;
}

export interface ScrapedStatRow extends StatFields {
  matchId: string;
  playerId: string;
}

/**
 * Construit la liste des corrections (une par couple match+joueur qui a au moins un
 * champ modifié). Une ligne scrapée sans stat enregistrée est incluse avec
 * `before = null` (l'application la créera).
 */
export function buildStatCorrections(
  storedRows: StoredStatRow[],
  scrapedRows: ScrapedStatRow[]
): StatCorrection[] {
  const storedByKey = new Map<string, StoredStatRow>();
  for (const r of storedRows) storedByKey.set(correctionKey(r.matchId, r.playerId), r);

  const corrections: StatCorrection[] = [];
  for (const scraped of scrapedRows) {
    const key = correctionKey(scraped.matchId, scraped.playerId);
    const stored: StatFields = storedByKey.get(key) ?? {};
    const changes = diffStatFields(stored, scraped);
    if (changes.length === 0) continue;

    const ratingChange = changes.find((c) => c.field === "lnhRating");
    corrections.push({
      key,
      matchId: scraped.matchId,
      playerId: scraped.playerId,
      changes,
      ratingChanged: Boolean(ratingChange),
      ratingBefore: ratingChange ? (ratingChange.before as number | null) : normalizeValue(stored.lnhRating) as number | null,
      ratingAfter: ratingChange ? (ratingChange.after as number | null) : normalizeValue(scraped.lnhRating) as number | null,
    });
  }

  // Tri : les corrections de note d'abord, puis par ampleur de la variation de note.
  corrections.sort((a, b) => {
    if (a.ratingChanged !== b.ratingChanged) return a.ratingChanged ? -1 : 1;
    const da = Math.abs((a.ratingAfter ?? 0) - (a.ratingBefore ?? 0));
    const db = Math.abs((b.ratingAfter ?? 0) - (b.ratingBefore ?? 0));
    return db - da;
  });

  return corrections;
}
