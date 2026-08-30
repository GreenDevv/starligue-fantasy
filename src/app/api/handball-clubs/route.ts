export const dynamic = "force-dynamic";

// GET /api/handball-clubs?q=<str>&country=<ISO2>&limit=10 — ARCHITECTURE.md §23.5.
// Recherche l'annuaire des clubs (HandballClub) pour l'autocomplétion du
// HomeClubPicker (inscription + /account). Public, hors PROTECTED_PREFIXES —
// comme GET /api/players. Recherche côté serveur : ~2300+ lignes, trop pour un
// chargement client. Seuls les clubs VÉRIFIÉS sont proposés (une saisie libre
// d'un autre membre en attente de validation ne doit pas remonter ici).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isCountryCode } from "@/lib/geo/countries";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  country: z
    .string()
    .transform((c) => c.toUpperCase())
    .refine(isCountryCode, "Code pays inconnu")
    .default("FR"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
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

  const clubs = await prisma.handballClub.findMany({
    where: {
      country,
      verified: true,
      name: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ city: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    take: limit,
    select: { id: true, name: true, city: true, zipcode: true, country: true },
  });

  return NextResponse.json({ data: { clubs } });
}
