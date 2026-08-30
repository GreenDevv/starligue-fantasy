export const dynamic = "force-dynamic";

// POST /api/auth/register — ARCHITECTURE.md §6.1
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { homeClubInputSchema, resolveHomeClubId } from "@/lib/clubs/home-club-input";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Mot de passe : 6 caractères minimum"),
  name: z.string().min(1).max(50),
  // Facultatif — demandé à l'inscription (src/app/(public)/register/page.tsx),
  // jamais bloquant. Vérifié ci-dessous plutôt que fait confiance (l'id vient du
  // client) : doit référencer un joueur réel de la saison live.
  favoritePlayerId: z.string().min(1).optional(),
  // Club d'origine (facultatif) — { clubId } | { newClub } — ARCHITECTURE.md §23.
  // Résolu après la création du compte, jamais bloquant (une valeur invalide est
  // ignorée en silence, contrairement à favoritePlayerId).
  homeClub: homeClubInputSchema.optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Corps de requête invalide" } },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Données invalides" } },
      { status: 422 },
    );
  }

  const { email, password, name, favoritePlayerId, homeClub } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: { code: "EMAIL_TAKEN", message: "Cette adresse email est déjà utilisée" } },
      { status: 409 },
    );
  }

  if (favoritePlayerId) {
    const player = await prisma.player.findUnique({ where: { id: favoritePlayerId }, select: { id: true } });
    if (!player) {
      return NextResponse.json(
        { error: { code: "INVALID_PLAYER", message: "Joueur préféré introuvable" } },
        { status: 422 },
      );
    }
  }

  // Club d'origine résolu avant la création pour le passer dans le même create().
  // Une erreur ici (clubId bidon, réseau) ne doit jamais empêcher l'inscription :
  // on ignore et le membre le renseignera depuis /account.
  let homeClubId: string | null = null;
  if (homeClub !== undefined && homeClub !== null) {
    try {
      homeClubId = await resolveHomeClubId(homeClub);
    } catch {
      homeClubId = null;
    }
  }

  // FantasyTeam n'est plus créée ici : chaque équipe est liée à une ligue
  // (créer/rejoindre une ligue crée l'équipe correspondante, voir
  // POST /api/leagues et /api/leagues/join). L'utilisateur passe par le verrou
  // "ligue obligatoire" de /leagues juste après l'inscription — ARCHITECTURE.md §8.3.
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(password, 12),
      name,
      favoritePlayerId,
      homeClubId,
    },
  });

  return NextResponse.json(
    { data: { id: user.id, email: user.email, name: user.name } },
    { status: 201 },
  );
}