// Génération de code d'invitation de ligue — extrait de api/leagues/route.ts pour
// être réutilisable par le script de backfill (scripts/migrate-teams-to-leagues.ts).
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length]!)
    .join("");
}

export async function generateUniqueInviteCode(): Promise<string> {
  let inviteCode = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.league.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    if (!exists) break;
    inviteCode = generateInviteCode();
  }
  return inviteCode;
}
