// Script ponctuel, idempotent : donne une League à chaque SimulationTeam existante
// (une ligue dédiée par équipe, pas de fusion implicite dans une ligue partagée),
// calqué explicitement sur scripts/migrate-teams-to-leagues.ts (même précédent déjà
// appliqué pour FantasyTeam.leagueId). Voir le plan de fusion live/simulation,
// étape 1 : SimulationTeam.leagueId reste nullable tant que ce script n'a pas
// tourné, passé NOT NULL ensuite (migration "contract").
import { prisma } from "../src/lib/db";
import { generateUniqueInviteCode } from "../src/lib/leagues/invite-code";

async function main() {
  const orphanTeams = await prisma.$queryRaw<{ id: string; userId: string; seasonId: string; userName: string }[]>`
    SELECT st.id, st."userId", st."seasonId", u.name AS "userName"
    FROM "SimulationTeam" st
    JOIN "User" u ON u.id = st."userId"
    WHERE st."leagueId" IS NULL
  `;

  for (const team of orphanTeams) {
    const inviteCode = await generateUniqueInviteCode();
    const league = await prisma.$transaction(async (tx) => {
      const l = await tx.league.create({
        data: {
          name: `Ligue de simulation de ${team.userName}`,
          inviteCode,
          ownerId: team.userId,
          seasonId: team.seasonId,
        },
      });
      await tx.leagueMember.upsert({
        where: { leagueId_userId: { leagueId: l.id, userId: team.userId } },
        create: { leagueId: l.id, userId: team.userId },
        update: {},
      });
      await tx.$executeRaw`
        UPDATE "SimulationTeam" SET "leagueId" = ${l.id} WHERE id = ${team.id}
      `;
      return l;
    });
    console.log(`[simulation team ${team.id}] rattachée à la nouvelle ligue "${league.name}" (${league.id})`);
  }

  const [{ count: remainingOrphans }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT count(*) FROM "SimulationTeam" WHERE "leagueId" IS NULL
  `;
  console.log(`Terminé. Équipes de simulation encore sans leagueId : ${remainingOrphans}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
