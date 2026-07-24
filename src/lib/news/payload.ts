// Formes structurées de NewsItem.payload (Json, pas de contrainte DB) pour les
// catégories générées TEAM_OF_WEEK / PERFORMANCE — validées ici par Zod pour la
// lecture (page publique /starligue), écrites par src/lib/news/generate-weekly-news.ts.
import { z } from "zod";

const POSITIONS = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"] as const;

export const TeamOfWeekPayloadSchema = z.object({
  gameweekNumber: z.number().int(),
  entries: z.array(
    z.object({
      position: z.enum(POSITIONS),
      playerId: z.string(),
      points: z.number(),
    })
  ),
});
export type TeamOfWeekPayload = z.infer<typeof TeamOfWeekPayloadSchema>;

export const PerformancesPayloadSchema = z.object({
  gameweekNumber: z.number().int(),
  entries: z.array(
    z.object({
      playerId: z.string(),
      points: z.number(),
      lnhRating: z.number().nullable(),
    })
  ),
});
export type PerformancesPayload = z.infer<typeof PerformancesPayloadSchema>;
