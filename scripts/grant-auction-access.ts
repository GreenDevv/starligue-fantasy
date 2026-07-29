import { PrismaClient } from '@prisma/client';

// Active le garde-fou bêta du mode Enchères (§18 ARCHITECTURE.md,
// User.canUseAuctionMode) pour un jeu restreint de comptes de test en prod.
//
// Requiert PROD_DATABASE_URL (URL Railway avec ?sslmode=require) — voir
// memory "prod_database_access" pour comment la récupérer via
// `railway variables`. Sans cette variable, on refuse de tourner pour ne
// jamais retomber silencieusement sur le Postgres local de dev.
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/grant-auction-access.ts'
  );
  process.exit(1);
}

const BETA_EMAILS = [
  'marin.bonaparte@hotmail.com',
  'martinvanegue@icloud.com',
  'sbonaparte7@outlook.com',
  'lucas.vanegue@yahoo.com',
];

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const result = await prisma.user.updateMany({
    where: { email: { in: BETA_EMAILS } },
    data: { canUseAuctionMode: true },
  });

  console.log(`${result.count}/${BETA_EMAILS.length} compte(s) mis à jour.`);

  const users = await prisma.user.findMany({
    where: { email: { in: BETA_EMAILS } },
    select: { email: true, canUseAuctionMode: true },
  });
  for (const email of BETA_EMAILS) {
    const found = users.find((u) => u.email === email);
    console.log(found ? `✓ ${email} → canUseAuctionMode=${found.canUseAuctionMode}` : `✗ ${email} introuvable en base`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
