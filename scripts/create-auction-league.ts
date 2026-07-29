import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Crée la première (et pour l'instant unique) ligue en mode Enchères (§18
// ARCHITECTURE.md) : 'Cresseron Gainneville Bid League', réservée aux 4
// comptes bêta (User.canUseAuctionMode) avec un budget de départ de 500
// (AUCTION_INITIAL_BUDGET, au lieu des 100 du mode classique).
//
// Requiert PROD_DATABASE_URL (URL Railway avec ?sslmode=require) — voir
// memory "prod_database_access". Sans cette variable, on refuse de tourner
// pour ne jamais retomber silencieusement sur le Postgres local de dev.
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/create-auction-league.ts'
  );
  process.exit(1);
}

const LEAGUE_NAME = 'Cresseron Gainneville Bid League';
const AUCTION_INITIAL_BUDGET = '500.0';
const BETA_EMAILS = [
  'marin.bonaparte@hotmail.com',
  'martinvanegue@icloud.com', // admin/owner de la ligue
  'sbonaparte7@outlook.com',
  'lucas.vanegue@yahoo.com',
];

// Copié de src/lib/team/jersey.ts::DEFAULT_JERSEY_CONFIG — scripts ad hoc du
// projet restent volontairement autonomes (pas d'import "@/lib/*", cf. les
// autres scripts de ce dossier) plutôt que de dépendre de la résolution des
// alias tsconfig sous tsx.
const DEFAULT_JERSEY_CONFIG = {
  jersey: { patternId: 'solid', colors: ['#2DD4BF', '#0E1116'] },
  shorts: { patternId: 'solid', colors: ['#0E1116'] },
  socks: { patternId: 'solid', colors: ['#0E1116'] },
  collar: 'crew',
  trimColor: '#F59E0B',
  contrastSleeves: false,
  number: 1,
  nameFlock: '',
};

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length]!)
    .join('');
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: BETA_EMAILS } },
    select: { id: true, email: true, name: true },
  });
  const missing = BETA_EMAILS.filter((e) => !users.some((u) => u.email === e));
  if (missing.length > 0) {
    console.error(`Compte(s) introuvable(s) en base, arrêt: ${missing.join(', ')}`);
    process.exit(1);
  }

  await prisma.user.updateMany({
    where: { email: { in: BETA_EMAILS } },
    data: { canUseAuctionMode: true },
  });
  console.log(`canUseAuctionMode activé pour les ${BETA_EMAILS.length} comptes.`);

  await prisma.gameConfig.upsert({
    where: { key: 'AUCTION_INITIAL_BUDGET' },
    update: {},
    create: { key: 'AUCTION_INITIAL_BUDGET', value: AUCTION_INITIAL_BUDGET },
  });

  const existing = await prisma.league.findFirst({ where: { name: LEAGUE_NAME } });
  if (existing) {
    console.error(
      `Une ligue "${LEAGUE_NAME}" existe déjà (id=${existing.id}) — script idempotent seulement sur le flag et le GameConfig, arrêt avant de recréer la ligue.`
    );
    process.exit(1);
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    console.error('Aucune saison live active (Season.isActive=true) — impossible de créer la ligue.');
    process.exit(1);
  }

  const owner = users.find((u) => u.email === 'martinvanegue@icloud.com')!;
  const inviteCode = generateInviteCode();

  const result = await prisma.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name: LEAGUE_NAME,
        inviteCode,
        ownerId: owner.id,
        seasonId: season.id,
        mode: 'AUCTION',
      },
    });

    const teams = [];
    for (const user of users) {
      await tx.leagueMember.create({ data: { leagueId: league.id, userId: user.id } });
      const team = await tx.fantasyTeam.create({
        data: {
          userId: user.id,
          leagueId: league.id,
          name: `Équipe de ${user.name}`,
          budget: AUCTION_INITIAL_BUDGET,
          jerseyConfig: DEFAULT_JERSEY_CONFIG,
        },
      });
      teams.push({ email: user.email, teamId: team.id });
    }

    return { league, teams };
  });

  console.log(`Ligue créée: ${result.league.name} (id=${result.league.id}, inviteCode=${result.league.inviteCode})`);
  for (const t of result.teams) {
    console.log(`  - ${t.email} → FantasyTeam ${t.teamId} (budget ${AUCTION_INITIAL_BUDGET})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
