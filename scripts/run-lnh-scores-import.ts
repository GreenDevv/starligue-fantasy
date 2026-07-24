// Script ponctuel : exécute la même logique que /api/admin/import/lnh-season-scores
// en direct (pas de session admin dispo hors navigateur pour tester manuellement).
import { PrismaClient } from "@prisma/client";
import { createLnhScraperProvider } from "../src/lib/data-providers/lnh-scraper.provider";
import { matchPlayerSeasonScores, type ScrapedScoreRow } from "../src/lib/players/lnh-score-matching";

const prisma = new PrismaClient();

async function main() {
  const lnhSeasonsId = process.argv[2] ?? "39";
  const seasonLabel = process.argv[3] ?? "2025/2026";

  const provider = createLnhScraperProvider();
  const scraped = await provider.fetchSeasonScores(lnhSeasonsId);
  console.log(`Scraped ${scraped.length} rows for seasons_id=${lnhSeasonsId}`);

  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("No active season");

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const rows: ScrapedScoreRow[] = scraped.map((s) => ({
    firstName: s.firstName,
    lastName: s.lastName,
    clubShortName: clubShortNameBySlug.get(s.lnhClubSlug.toLowerCase()) ?? s.lnhClubSlug,
    matchesPlayed: s.matchesPlayed,
    totalScore: s.totalScore,
  }));

  const { matches, unmatched } = matchPlayerSeasonScores(
    rows,
    players.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, clubShortName: p.club.shortName })),
  );

  if (matches.length > 0) {
    await prisma.$transaction(
      matches.map((m) =>
        prisma.playerLnhSeasonStat.upsert({
          where: { playerId_seasonLabel: { playerId: m.playerId, seasonLabel } },
          create: {
            playerId: m.playerId,
            seasonLabel,
            lnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
          update: {
            lnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
        })
      )
    );
  }

  const transfersDetected = matches.filter((m) => m.matchedByNameOnly);

  console.log(JSON.stringify({
    totalScraped: scraped.length,
    matched: matches.length,
    transfersDetected: transfersDetected.length,
    unmatchedCount: unmatched.length,
  }, null, 2));

  console.log("Transfers detected (matched by name only, club differs from scraped season):");
  console.log(JSON.stringify(transfersDetected.slice(0, 40), null, 2));

  console.log("Sample unmatched (up to 40):");
  console.log(JSON.stringify(unmatched.slice(0, 40).map((u) => ({ ...u.row, reason: u.reason })), null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
