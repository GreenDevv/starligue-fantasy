// Résolution de l'entrée "club d'origine" d'un membre — ARCHITECTURE.md §23.5.
// Partagé par PUT /api/account et POST /api/auth/register. Trois formes :
//   { clubId }            → club déjà dans l'annuaire (choisi via l'autocomplétion)
//   { newClub: { … } }    → saisie libre : réutilise un club existant identique,
//                           sinon en crée un MANUAL / verified=false
//   null                  → retire le club d'origine
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isCountryCode } from "@/lib/geo/countries";
import { geocodeCity } from "@/lib/geo/cities";

export const homeClubInputSchema = z.union([
  z.object({ clubId: z.string().min(1) }),
  z.object({
    newClub: z
      .object({
        name: z.string().trim().min(2).max(120),
        country: z
          .string()
          .transform((c) => c.toUpperCase())
          .refine(isCountryCode, "Code pays inconnu"),
        city: z.string().trim().max(120).optional(),
        // Coordonnées de la ville, quand elle vient de l'autocomplétion
        // (src/lib/geo/cities.ts). Les deux ensemble ou aucune.
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      })
      .refine((v) => (v.latitude == null) === (v.longitude == null), "latitude et longitude vont ensemble"),
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

export interface ResolvedHomeClub {
  /** id à stocker dans `User.homeClubId` (null = retire le club). */
  homeClubId: string | null;
  /** id du `HandballClub` MANUAL `verified=false` créé à l'instant (sinon null) —
   *  l'appelant s'en sert pour notifier l'admin (best-effort). */
  createdClubId: string | null;
}

/**
 * Résout l'entrée « club d'origine » d'un membre. Lève `HomeClubError` si un
 * `clubId` fourni ne correspond à rien.
 */
export async function resolveHomeClubId(input: HomeClubInput): Promise<ResolvedHomeClub> {
  if (input === null) return { homeClubId: null, createdClubId: null };

  if ("clubId" in input) {
    const club = await prisma.handballClub.findUnique({
      where: { id: input.clubId },
      select: { id: true },
    });
    if (!club) throw new HomeClubError("HANDBALL_CLUB_NOT_FOUND", "Club introuvable");
    return { homeClubId: club.id, createdClubId: null };
  }

  const { name, country, city } = input.newClub;

  // Coordonnées : celles fournies par l'autocomplétion de ville, sinon on tente
  // un géocodage local depuis le nom de ville saisi. Un club sans coordonnées
  // reste comptabilisé mais n'apparaît pas sur la carte (« non localisé »).
  const coords =
    input.newClub.latitude != null && input.newClub.longitude != null
      ? { latitude: input.newClub.latitude, longitude: input.newClub.longitude }
      : city
        ? geocodeCity(city, country)
        : null;

  // Réutilise un club identique (nom + pays + ville, casse ignorée) plutôt que
  // d'empiler des doublons. Les variantes d'accents/orthographe restantes sont
  // fusionnées par l'admin (/admin/handball-clubs).
  const existing = await prisma.handballClub.findFirst({
    where: {
      country,
      name: { equals: name, mode: "insensitive" },
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
    },
    select: { id: true, latitude: true },
  });
  if (existing) {
    // Renseigne les coordonnées si le club existant n'en avait pas encore.
    if (existing.latitude == null && coords) {
      await prisma.handballClub.update({ where: { id: existing.id }, data: coords });
    }
    return { homeClubId: existing.id, createdClubId: null };
  }

  const created = await prisma.handballClub.create({
    data: {
      name,
      country,
      city: city ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      slug: await uniqueSlug(`${slugify(name)}-${country.toLowerCase()}`),
      source: "MANUAL",
      verified: false,
    },
    select: { id: true },
  });
  return { homeClubId: created.id, createdClubId: created.id };
}
