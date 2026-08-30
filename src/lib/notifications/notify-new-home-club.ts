// Notifie par email tous les administrateurs quand un membre saisit librement un
// club d'origine hors annuaire (HandballClub source=MANUAL, verified=false) afin
// qu'ils le valident ou le rejettent (/admin/handball-clubs, §23.5).
//
// Appelé BEST-EFFORT depuis PUT /api/account et POST /api/auth/register (après
// resolveHomeClubId, quand `createdClubId` est non-null) : un échec d'email ne
// doit jamais faire échouer l'inscription ou la mise à jour du compte.
import { prisma } from "@/lib/db";
import { sendNewHomeClubEmail } from "@/lib/email/send-new-home-club-email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

export interface NotifyNewHomeClubResult {
  notified: number;
  failed: number;
}

export async function notifyAdminsNewHomeClub(opts: {
  clubId: string;
  memberName: string;
}): Promise<NotifyNewHomeClubResult> {
  const [club, admins] = await Promise.all([
    prisma.handballClub.findUnique({
      where: { id: opts.clubId },
      select: { name: true, city: true, country: true, verified: true, source: true },
    }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } }),
  ]);

  // Garde : rien à faire si le club a déjà été validé/supprimé entre-temps, ou
  // si ce n'est pas une saisie libre.
  if (!club || club.verified || club.source !== "MANUAL") return { notified: 0, failed: 0 };
  if (admins.length === 0) return { notified: 0, failed: 0 };

  const params = {
    clubName: club.name,
    city: club.city,
    country: club.country,
    memberName: opts.memberName,
    adminUrl: `${APP_URL}/fr/admin/handball-clubs`,
  };

  let notified = 0;
  let failed = 0;
  for (const { email } of admins) {
    try {
      await sendNewHomeClubEmail(email, params);
      notified += 1;
    } catch {
      failed += 1;
    }
  }
  return { notified, failed };
}
