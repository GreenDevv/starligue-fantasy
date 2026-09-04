import { PrismaClient } from '@prisma/client';

// Backfille FantasyTeam.validatedAt (ajouté par la migration
// 20260904120000_add_team_validated_at) pour les équipes déjà validées avant ce
// déploiement — on n'a pas de trace de la date de validation réelle, on retombe
// donc sur createdAt (une équipe pré-saison a forcément été validée avant la
// deadline de J1, donc createdAt est une borne sûre pour le garde-fou de
// snapshot-lineups). Les équipes non validées restent à null.
//
// snapshot-lineups tolère déjà validatedAt == null (fallback createdAt), donc ce
// backfill n'est pas bloquant — il ne fait que rendre la donnée explicite.
//
// À exécuter une fois en prod juste après le déploiement de la migration, jamais
// en local (voir memory prod_database_access pour récupérer PROD_DATABASE_URL).
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-team-validated-at.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true, validatedAt: null },
    select: { id: true, createdAt: true },
  });

  for (const team of teams) {
    await prisma.fantasyTeam.update({
      where: { id: team.id },
      data: { validatedAt: team.createdAt },
    });
  }

  console.log(`${teams.length} équipe(s) validée(s) backfillée(s) sur createdAt.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
