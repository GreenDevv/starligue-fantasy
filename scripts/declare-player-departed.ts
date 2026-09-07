import { prisma } from "@/lib/db";
import { createInjuryNewsItem } from "@/lib/news/generate-injury-news";
import { notifyPlayerInjuredOwners } from "@/lib/notifications/notify-player-injured";

// One-off : rejoue exactement la logique de PUT /api/admin/players/[id] pour une
// transition injuredAt null -> maintenant (isActive:false + motif libre), sans
// passer par une session admin. Sert quand un joueur quitte la Starligue en cours
// de saison (ex. transfert à l'étranger) : même mécanisme que le joker médical,
// mais wording "indisponible (motif)" au lieu de "blessé" — voir generate-injury-news.ts.
//
// Requiert DATABASE_URL = URL Railway prod (?sslmode=require) + RESEND_API_KEY /
// EMAIL_FROM / NEXT_PUBLIC_APP_URL pour l'envoi des emails aux propriétaires.
//   DATABASE_URL="<prod>?sslmode=require" RESEND_API_KEY=... EMAIL_FROM=... \
//   NEXT_PUBLIC_APP_URL=https://starliguefantasy.fr \
//   npx tsx scripts/declare-player-departed.ts <playerId> "<motif>"

async function main() {
  const [playerId, reason] = process.argv.slice(2);
  if (!playerId || !reason) {
    console.error('Usage: npx tsx scripts/declare-player-departed.ts <playerId> "<motif>"');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/rlwy\.net|proxy\.rlwy|railway/.test(dbUrl)) {
    console.error(
      "DATABASE_URL ne ressemble pas à la prod Railway. Refus (piège base locale, cf. memory prod_database_access).\n" +
        `  DATABASE_URL="${dbUrl.slice(0, 40)}..."`
    );
    process.exit(1);
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { club: { select: { id: true, name: true, shortName: true } }, season: { select: { label: true, isActive: true } } },
  });
  if (!player) {
    console.error(`Joueur ${playerId} introuvable`);
    process.exit(1);
  }

  console.log(
    `Joueur : ${player.firstName} ${player.lastName} (${player.club.shortName}, ${player.position}) — saison ${player.season.label}${
      player.season.isActive ? " [LIVE]" : ""
    }`
  );
  console.log(`  injuredAt actuel : ${player.injuredAt?.toISOString() ?? "null"} · isActive : ${player.isActive}`);
  console.log(`  motif : "${reason}"`);

  const owners = await prisma.fantasySquadPlayer.findMany({
    where: { playerId },
    select: { fantasyTeam: { select: { name: true, user: { select: { email: true } } } } },
  });
  console.log(`  ${owners.length} effectif(s) concerné(s) : ${owners.map((o) => `${o.fantasyTeam.name} <${o.fantasyTeam.user.email}>`).join(", ") || "aucun"}`);

  const wasInjured = player.injuredAt != null;
  const now = new Date();

  await prisma.player.update({
    where: { id: playerId },
    data: { isActive: false, injuredAt: wasInjured ? player.injuredAt : now },
  });
  console.log(`\n✓ Player mis à jour (isActive=false, injuredAt=${(wasInjured ? player.injuredAt! : now).toISOString()})`);

  // Actu publique — best-effort, hors transaction (comme la route).
  try {
    await createInjuryNewsItem(
      {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        seasonId: player.seasonId,
        injuredAt: wasInjured ? player.injuredAt : now,
        club: player.club,
      },
      reason
    );
    console.log("✓ Actu générée (createInjuryNewsItem)");
  } catch (e) {
    console.error("✗ Échec actu :", e);
  }

  // Emails aux propriétaires — uniquement à la transition null -> non-null.
  if (wasInjured) {
    console.log("↷ Joueur déjà indisponible auparavant : pas de nouvel email (comme la route).");
  } else {
    try {
      const res = await notifyPlayerInjuredOwners(
        {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          marketValue: Number(player.marketValue),
          club: player.club,
        },
        reason
      );
      console.log(`✓ Emails : ${res.notified} envoyé(s), ${res.failed} échec(s)`);
    } catch (e) {
      console.error("✗ Échec emails :", e);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
