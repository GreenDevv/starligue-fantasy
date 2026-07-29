export const dynamic = "force-dynamic";

// POST /api/auth/forgot-password — ARCHITECTURE.md §6.1
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashResetToken, computeResetTokenExpiry } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset-email";
import { routing } from "@/i18n/routing";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(routing.locales),
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

  const { email, locale } = parsed.data;

  // Réponse toujours identique, compte trouvé ou non : ne jamais révéler si un
  // email est enregistré (anti-enumeration).
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const rawToken = randomBytes(32).toString("hex");

    await prisma.$transaction([
      // Un seul token actif par utilisateur — les précédents (non consommés) sont
      // invalidés avant d'en émettre un nouveau.
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: computeResetTokenExpiry(),
        },
      }),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/${locale}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(email, locale, resetUrl);
    } catch (err) {
      console.error("[forgot-password] échec d'envoi de l'email", err);
    }
  }

  return NextResponse.json({ data: { sent: true } }, { status: 200 });
}
