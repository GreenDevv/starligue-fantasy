// Script ponctuel, idempotent : bascule le modèle "1 équipe globale par joueur"
// vers "1 équipe par (joueur, ligue)". Voir ARCHITECTURE.md §2.5/§5. Utilise du
// SQL brut pour la détection (plutôt que le client Prisma typé) car il doit
// rester valide même une fois que le schéma est passé en NOT NULL sur
// leagueId/jerseyConfig — sur un état déjà migré, les deux passes ne trouvent
// simplement rien à faire.
//
// Deux passes :
// 1. Toute FantasyTeam sans leagueId reçoit une League dédiée fraîchement créée
//    (+ LeagueMember associé) plutôt que de rester orpheline.
// 2. Tout LeagueMember sans FantasyTeam(userId, leagueId) correspondante (gap
//    déjà présent avant ce changement : rejoindre/créer une ligue ne créait
//    jamais d'équipe) reçoit une équipe par défaut, non validée.
import { prisma } from "../src/lib/db";
import { generateUniqueInviteCode } from "../src/lib/leagues/invite-code";
import { DEFAULT_JERSEY_CONFIG } from "../src/lib/team/jersey";

async function getInitialBudget(): Promise<number> {
  const config = await prisma.gameConfig.findUnique({ where: { key: "INITIAL_BUDGET" } });
  return parseFloat(config?.value ?? process.env.INITIAL_BUDGET ?? "100.0");
}

async function main() {
  const initialBudget = await getInitialBudget();
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison live active — impossible de rattacher les ligues créées ici.");

  // Passe 1 : équipes orphelines (leagueId null) → une ligue dédiée par équipe.
  const orphanTeams = await prisma.$queryRaw<{ id: string; userId: string; userName: string }[]>`
    SELECT ft.id, ft."userId", u.name AS "userName"
    FROM "FantasyTeam" ft
    JOIN "User" u ON u.id = ft."userId"
    WHERE ft."leagueId" IS NULL
  `;

  for (const team of orphanTeams) {
    const inviteCode = await generateUniqueInviteCode();
    const league = await prisma.$transaction(async (tx) => {
      const l = await tx.league.create({
        data: { name: `Ligue de ${team.userName}`, inviteCode, ownerId: team.userId, seasonId: season.id },
      });
      await tx.leagueMember.upsert({
        where: { leagueId_userId: { leagueId: l.id, userId: team.userId } },
        create: { leagueId: l.id, userId: team.userId },
        update: {},
      });
      await tx.$executeRaw`
        UPDATE "FantasyTeam"
        SET "leagueId" = ${l.id}, "jerseyConfig" = COALESCE("jerseyConfig", ${DEFAULT_JERSEY_CONFIG}::jsonb)
        WHERE id = ${team.id}
      `;
      return l;
    });
    console.log(`[team ${team.id}] rattachée à la nouvelle ligue "${league.name}" (${league.id})`);
  }

  // Passe 2 : memberships sans équipe correspondante → équipe par défaut.
  const orphanMemberships = await prisma.$queryRaw<
    { leagueId: string; userId: string; userName: string }[]
  >`
    SELECT lm."leagueId", lm."userId", u.name AS "userName"
    FROM "LeagueMember" lm
    JOIN "User" u ON u.id = lm."userId"
    LEFT JOIN "FantasyTeam" ft ON ft."userId" = lm."userId" AND ft."leagueId" = lm."leagueId"
    WHERE ft.id IS NULL
  `;

  for (const membership of orphanMemberships) {
    const team = await prisma.fantasyTeam.create({
      data: {
        userId: membership.userId,
        leagueId: membership.leagueId,
        name: `Équipe de ${membership.userName}`,
        budget: initialBudget,
        jerseyConfig: DEFAULT_JERSEY_CONFIG,
      },
    });
    console.log(`[membership ${membership.leagueId}/${membership.userId}] équipe par défaut créée (${team.id})`);
  }

  const [{ count: remainingOrphans }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT count(*) FROM "FantasyTeam" WHERE "leagueId" IS NULL
  `;
  console.log(`Terminé. Équipes encore sans leagueId : ${remainingOrphans}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
