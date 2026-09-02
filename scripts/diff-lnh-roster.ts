// Read-only : compare l'effectif lnh.fr (pages club + liste joueurs) à notre roster
// de la saison active. N'écrit rien.
import { PrismaClient } from "@prisma/client";
import { createLnhScraperProvider } from "../src/lib/data-providers/lnh-scraper.provider";

const prisma = new PrismaClient();

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s]+/g, " ").trim();
}

async function main() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_SEASON");

  const provider = createLnhScraperProvider();
  const roster = await provider.fetchPlayersFromClubRosters();

  const clubs = await prisma.club.findMany();
  const clubBySlug = new Map<string, { id: string; shortName: string }>();
  for (const c of clubs) {
    const slug = (c.externalIds as Record<string, string> | null)?.lnh;
    if (slug) clubBySlug.set(slug.toLowerCase(), { id: c.id, shortName: c.shortName });
  }

  const dbPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });
  const dbByName = new Map<string, typeof dbPlayers[number]>();
  for (const p of dbPlayers) dbByName.set(`${norm(p.lastName)}|${norm(p.firstName)}`, p);

  console.log(`lnh.fr club rosters : ${roster.length} joueurs | DB saison active : ${dbPlayers.length}\n`);

  const missing: string[] = [];
  for (const sp of roster) {
    const key = `${norm(sp.lastName)}|${norm(sp.firstName)}`;
    if (!dbByName.has(key)) {
      const club = clubBySlug.get(sp.lnhClubSlug.toLowerCase());
      missing.push(`  + ${sp.firstName} ${sp.lastName} — ${sp.position} — ${club?.shortName ?? sp.lnhClubSlug}`);
    }
  }
  console.log(`Sur lnh.fr mais PAS dans notre DB (${missing.length}) :`);
  console.log(missing.join("\n") || "  (aucun)");

  const rosterKeys = new Set(roster.map((sp) => `${norm(sp.lastName)}|${norm(sp.firstName)}`));
  const orphans = dbPlayers.filter((p) => p.isActive && !rosterKeys.has(`${norm(p.lastName)}|${norm(p.firstName)}`));
  console.log(`\nDans notre DB (actifs) mais PAS sur lnh.fr (${orphans.length}) :`);
  console.log(orphans.map((p) => `  - ${p.firstName} ${p.lastName} — ${p.club.shortName}`).join("\n") || "  (aucun)");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
