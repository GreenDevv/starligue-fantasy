import { PrismaClient } from "@prisma/client";
import { resolveEventPlayerId, type EventPlayerCandidate } from "../src/lib/live/resolve-event-player";

// Backfille MatchLiveEvent.playerId pour les lignes déjà en base au moment du bug
// de casse dans resolveEventPlayerId (comparaison sensible à la casse alors que
// Player.lastName est stocké tout en majuscules pour une partie des clubs — voir le
// commentaire de resolve-event-player.ts) : 280/280 événements du 11/09 avaient
// playerId=null. Rejoue la résolution avec la version corrigée sur toutes les
// lignes playerId=null, match par match (même logique que live-feed.ts : effectif
// des 2 clubs du match comme candidats).
//
// Rejouable sans risque (idempotent : ne touche que les lignes encore à null,
// jamais un playerId déjà résolu).
//
// À exécuter en prod juste après le déploiement du fix (voir memory
// prod_database_access pour récupérer PROD_DATABASE_URL) :
//   PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-live-event-players.ts
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    "PROD_DATABASE_URL manquant. Récupérer via:\n" +
      "  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n" +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-live-event-players.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const unresolved = await prisma.matchLiveEvent.findMany({
    where: { playerId: null },
    select: { id: true, text: true, matchId: true },
  });
  console.log(`${unresolved.length} événement(s) sans playerId à retenter.`);
  if (unresolved.length === 0) return;

  const matchIds = [...new Set(unresolved.map((e) => e.matchId))];
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
    select: { id: true, homeClubId: true, awayClubId: true, seasonId: true },
  });
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Effectif par club, chargé une seule fois pour tous les clubs concernés.
  const clubIds = [...new Set(matches.flatMap((m) => [m.homeClubId, m.awayClubId]))];
  const seasonIds = [...new Set(matches.map((m) => m.seasonId))];
  const players = await prisma.player.findMany({
    where: { seasonId: { in: seasonIds }, clubId: { in: clubIds } },
    select: { id: true, firstName: true, lastName: true, clubId: true },
  });
  const rosterByClub = new Map<string, EventPlayerCandidate[]>();
  for (const p of players) {
    const arr = rosterByClub.get(p.clubId) ?? [];
    arr.push({ id: p.id, firstName: p.firstName, lastName: p.lastName });
    rosterByClub.set(p.clubId, arr);
  }

  let resolved = 0;
  for (const event of unresolved) {
    const match = matchById.get(event.matchId);
    if (!match) continue;
    const candidates = [...(rosterByClub.get(match.homeClubId) ?? []), ...(rosterByClub.get(match.awayClubId) ?? [])];
    const playerId = resolveEventPlayerId(event.text, candidates);
    if (!playerId) continue;
    await prisma.matchLiveEvent.update({ where: { id: event.id }, data: { playerId } });
    resolved++;
  }

  console.log(`${resolved}/${unresolved.length} événement(s) résolu(s) et mis à jour.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
