// Résolution de l'entrée "club d'origine" d'un membre — ARCHITECTURE.md §23.5.
// Partagé par PUT /api/account et POST /api/auth/register. Trois formes :
//   { clubId }            → club déjà dans l'annuaire (choisi via l'autocomplétion)
//   { newClub: { … } }    → saisie libre : réutilise un club existant identique,
//                           sinon en crée un MANUAL / verified=false
//   null                  → retire le club d'origine
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isCountryCode } from "@/lib/geo/countries";

export const homeClubInputSchema = z.union([
  z.object({ clubId: z.string().min(1) }),
  z.object({
    newClub: z.object({
      name: z.string().trim().min(2).max(120),
      country: z
        .string()
        .transform((c) => c.toUpperCase())
        .refine(isCountryCode, "Code pays inconnu"),
      city: z.string().trim().max(120).optional(),
    }),
  }),
  z.null(),
]);

export type HomeClubInput = z.infer<typeof homeClubInputSchema>;

export class HomeClubError extends Error {
  constructor(
    public readonly code: "HANDBALL_CLUB_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "HomeClubError";
  }
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base.slice(0, 80) || "club";
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const clash = await prisma.handballClub.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Renvoie l'id de HandballClub à stocker dans `User.homeClubId` (ou null).
 * Lève `HomeClubError` si un `clubId` fourni ne correspond à rien.
 */
export async function resolveHomeClubId(input: HomeClubInput): Promise<string | null> {
  if (input === null) return null;

  if ("clubId" in input) {
    const club = await prisma.handballClub.findUnique({
      where: { id: input.clubId },
      select: { id: true },
    });
    if (!club) throw new HomeClubError("HANDBALL_CLUB_NOT_FOUND", "Club introuvable");
    return club.id;
  }

  const { name, country, city } = input.newClub;

  // Réutilise un club identique (nom + pays + ville, casse ignorée) plutôt que
  // d'empiler des doublons. Les variantes d'accents/orthographe restantes sont
  // fusionnées par l'admin (/admin/handball-clubs).
  const existing = await prisma.handballClub.findFirst({
    where: {
      country,
      name: { equals: name, mode: "insensitive" },
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.handballClub.create({
    data: {
      name,
      country,
      city: city ?? null,
      slug: await uniqueSlug(`${slugify(name)}-${country.toLowerCase()}`),
      source: "MANUAL",
      verified: false,
    },
    select: { id: true },
  });
  return created.id;
}
