export const dynamic = "force-dynamic";

// POST /api/auth/reset-password — ARCHITECTURE.md §6.1
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashResetToken, isResetTokenExpired } from "@/lib/auth/password-reset";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Mot de passe : 6 caractères minimum"),
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

  const { token, password } = parsed.data;
  const tokenHash = hashResetToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!resetToken) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Ce lien de réinitialisation n'est plus valide" } },
      { status: 400 },
    );
  }

  if (isResetTokenExpired(resetToken.expiresAt)) {
    // Expiré : purgé immédiatement, un lien mort ne doit pas rester utilisable
    // même par erreur (protège aussi contre un token qu'on aurait laissé traîner).
    await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
    return NextResponse.json(
      { error: { code: "TOKEN_EXPIRED", message: "Ce lien de réinitialisation a expiré" } },
      { status: 400 },
    );
  }

  const passwordHash = await hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    // Tous les tokens de l'utilisateur, pas seulement celui utilisé : un
    // ancien lien resté dans une boîte mail ne doit plus être valide non plus.
    prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return NextResponse.json({ data: { reset: true } }, { status: 200 });
}
