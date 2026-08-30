export const dynamic = "force-dynamic";

// GET /api/geo/cities?q=<str>&country=<ISO2>&limit=8 — ARCHITECTURE.md §23.5.
// Autocomplétion de ville pour géolocaliser un club saisi librement dans le
// HomeClubPicker (inscription + /account). Public, comme /api/handball-clubs.
// Données = snapshot GeoNames embarqué (src/lib/geo/cities.ts).

import { NextResponse } from "next/server";
import { z } from "zod";
import { isCountryCode } from "@/lib/geo/countries";
import { searchCities } from "@/lib/geo/cities";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  country: z
    .string()
    .transform((c) => c.toUpperCase())
    .refine(isCountryCode, "Code pays inconnu")
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: parsed.error.issues[0]?.message ?? "Requête invalide" } },
      { status: 400 },
    );
  }

  const { q, country, limit } = parsed.data;
  const cities = searchCities(q, { country, limit });
  return NextResponse.json({ data: { cities } });
}
