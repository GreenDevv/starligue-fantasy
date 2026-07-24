// CsvImportProvider — ARCHITECTURE.md §3.2, §7
// Parseur CSV défensif avec rapport d'erreurs ligne par ligne.

import { z } from "zod";

export type CsvParseResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; errors: { line: number; message: string }[] };

// ---------- Schemas CSV (§7) ----------

const positionEnum = z.enum(["GK", "LW", "LB", "CB", "RB", "RW", "PV"]);

export const ClubCsvSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1).max(10),
  // Accepte une URL absolue (source externe) ou un chemin local /public (ex: /clubs/mhb.png,
  // convention adoptée Phase 4 pour ne plus dépendre de lnh.fr en prod).
  logoUrl: z
    .string()
    .refine((v) => v === "" || v.startsWith("/") || z.string().url().safeParse(v).success, "logoUrl invalide")
    .optional()
    .or(z.literal("")),
});

export const PlayerCsvSchema = z.object({
  clubShortName: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  position: positionEnum,
  marketValue: z.coerce.number().min(0.5).max(99.9),
});

export const FixtureCsvSchema = z.object({
  gameweek: z.coerce.number().int().min(1).max(38),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Format: YYYY-MM-DD HH:MM"),
  homeShortName: z.string().min(1),
  awayShortName: z.string().min(1),
});

export const ResultCsvSchema = z.object({
  gameweek: z.coerce.number().int().min(1),
  homeShortName: z.string().min(1),
  awayShortName: z.string().min(1),
  homeScore: z.coerce.number().int().min(0),
  awayScore: z.coerce.number().int().min(0),
});

export const RatingCsvSchema = z.object({
  gameweek: z.coerce.number().int().min(1),
  homeShortName: z.string().min(1),
  awayShortName: z.string().min(1),
  clubShortName: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  lnhRating: z.preprocess(
    (v) => (v === "" ? null : Number(v)),
    z.number().min(0).max(10).nullable(),
  ),
  played: z.coerce.number().int().min(0).max(1).transform((v) => v === 1),
});

// ---------- Parser générique ----------

function parseCsvText<S extends z.ZodTypeAny>(
  text: string,
  schema: S,
): CsvParseResult<z.output<S>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { ok: false, errors: [{ line: 0, message: "Fichier vide ou sans données" }] };
  }

  const headers = lines[0]!.split(",").map((h) => h.trim());
  const errors: { line: number; message: string }[] = [];
  const rows: z.output<S>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const values = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] ?? "").trim();
    });

    const parsed = schema.safeParse(obj);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      errors.push({
        line: i + 1,
        message: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}

export type ClubCsvRow = z.infer<typeof ClubCsvSchema>;
export type PlayerCsvRow = z.infer<typeof PlayerCsvSchema>;
export type FixtureCsvRow = z.infer<typeof FixtureCsvSchema>;
export type ResultCsvRow = z.infer<typeof ResultCsvSchema>;
export type RatingCsvRow = z.infer<typeof RatingCsvSchema>;

export const CsvProvider = {
  parseClubs: (text: string) => parseCsvText(text, ClubCsvSchema),
  parsePlayers: (text: string) => parseCsvText(text, PlayerCsvSchema),
  parseFixtures: (text: string) => parseCsvText(text, FixtureCsvSchema),
  parseResults: (text: string) => parseCsvText(text, ResultCsvSchema),
  parseRatings: (text: string) => parseCsvText(text, RatingCsvSchema),
};
