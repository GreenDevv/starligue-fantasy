import { PrismaClient } from '@prisma/client';

// Requiert PROD_DATABASE_URL (URL Railway avec ?sslmode=require) — voir memory
// "prod_database_access" pour comment la récupérer via `railway variables`.
// Sans cette variable, on refuse de tourner pour ne jamais retomber
// silencieusement sur le Postgres local de dev (piège du 2026-07-28).
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/run-recap-most-selected.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const totalUsers = await prisma.user.count();
  const totalTeams = await prisma.fantasyTeam.count();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const newUsers = await prisma.user.count({ where: { createdAt: { gte: startOfToday } } });

  const favCounts = await prisma.user.groupBy({
    by: ['favoritePlayerId'],
    where: { favoritePlayerId: { not: null } },
    _count: { favoritePlayerId: true },
    orderBy: { _count: { favoritePlayerId: 'desc' } },
  });
  const favIds = favCounts.map((f) => f.favoritePlayerId!).filter(Boolean);
  const favPlayers = await prisma.player.findMany({
    where: { id: { in: favIds } },
    select: { id: true, firstName: true, lastName: true, club: { select: { name: true } } },
  });
  const favMap = new Map(favPlayers.map((p) => [p.id, p]));

  const topFantasy = await prisma.fantasySquadPlayer.groupBy({
    by: ['playerId'],
    _count: { playerId: true },
    orderBy: { _count: { playerId: 'desc' } },
    take: 20,
  });
  const fantasyPlayers = await prisma.player.findMany({
    where: { id: { in: topFantasy.map((t) => t.playerId) } },
    select: { id: true, firstName: true, lastName: true, position: true, club: { select: { name: true } } },
  });
  const fpMap = new Map(fantasyPlayers.map((p) => [p.id, p]));

  console.log(`Total users: ${totalUsers} (dont ${newUsers} créés depuis ce matin)`);
  console.log(`Total FantasyTeam: ${totalTeams}`);

  console.log(`\n=== Joueurs préférés — ensemble de la base (${favCounts.reduce((a, c) => a + c._count.favoritePlayerId, 0)}/${totalUsers} comptes renseignés) ===`);
  for (const f of favCounts) {
    const p = favMap.get(f.favoritePlayerId!);
    console.log(`- ${p?.firstName} ${p?.lastName} (${p?.club?.name}) : ${f._count.favoritePlayerId}`);
  }

  console.log(`\n=== Joueurs les plus sélectionnés dans les équipes — ensemble de la base (Top 20 sur ${totalTeams} équipes) ===`);
  for (const t of topFantasy) {
    const p = fpMap.get(t.playerId);
    console.log(`- ${p?.firstName} ${p?.lastName} (${p?.club?.name}, ${p?.position}) : ${t._count.playerId} équipes`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
