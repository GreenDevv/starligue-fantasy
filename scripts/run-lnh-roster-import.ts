// Script ponctuel : exécute la même logique que /api/admin/import/lnh-roster
// en direct (pas de session admin dispo hors navigateur pour tester manuellement).
import { PrismaClient } from "@prisma/client";
import { createLnhScraperProvider, IngestionError } from "../src/lib/data-providers/lnh-scraper.provider";

const prisma = new PrismaClient();

const BASE_MV: Record<string, number> = {
  GK: 9.0,
  CB: 8.5,
  LB: 8.0,
  RB: 8.0,
  LW: 7.5,
  RW: 7.5,
  PV: 7.5,
};

const LNH_SLUG_MAP: Record<string, { shortName: string; fullName: string }> = {
  "aix": { shortName: "PAUC", fullName: "Pays d'Aix Université Club HB" },
  "cesson-rennes": { shortName: "CRMHB", fullName: "Cesson-Rennes Métropole HB" },
  "chambery": { shortName: "CSMBH", fullName: "Chambéry Savoie Mont Blanc HB" },
  "chartres": { shortName: "CCMHB", fullName: "C' Chartres Métropole HB" },
  "dijon": { shortName: "GDH", fullName: "Grand Dijon Handball" },
  "dunkerque": { shortName: "USDK", fullName: "USDK Dunkerque HGL" },
  "istres": { shortName: "IPH", fullName: "Istres Provence Handball" },
  "limoges": { shortName: "LIMOGES", fullName: "Limoges Handball" },
  "montpellier": { shortName: "MHB", fullName: "Montpellier Handball" },
  "nantes": { shortName: "HBCN", fullName: "HBC Nantes" },
  "nimes": { shortName: "USAM", fullName: "USAM Nîmes Gard" },
  "paris": { shortName: "PSG", fullName: "Paris Saint-Germain Handball" },
  "saint-raphael": { shortName: "SRHB", fullName: "Saint-Raphaël Var Handball" },
  "selestat": { shortName: "SAH", fullName: "Sélestat Alsace Handball" },
  "toulouse": { shortName: "FENIX", fullName: "Fenix Toulouse Handball" },
  "tremblay": { shortName: "TFHB", fullName: "Tremblay-en-France HB" },
};

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s]+/g, " ").trim();
}

function roundMV(v: number): number {
  return Math.min(20.0, Math.max(4.0, Math.round(v * 2) / 2));
}

async function main() {
  const lnhSeasonsId = process.argv[2] ?? "40"; // 2026/2027

  const provider = createLnhScraperProvider();
  let scraped;
  try {
    // fetchPlayers(seasonsId) ne retourne parfois que quelques clubs (page stats lnh.fr
    // partiellement peuplée hors-saison) sans déclencher son fallback interne (qui ne se
    // déclenche que si 0 résultat au total, pas si résultat partiel) — on force ici
    // directement la méthode fallback fiable (effectifs par page club), déjà vérifiée
    // en Phase 3.6 pour donner les 16 clubs complets.
    scraped = await provider.fetchPlayersFromClubRosters();
  } catch (e) {
    if (e instanceof IngestionError) {
      console.error("SCRAPER_ERROR:", e.message);
      process.exit(1);
    }
    throw e;
  }

  if (scraped.length === 0) {
    console.error("NO_DATA: aucun joueur scrapé depuis lnh.fr");
    process.exit(1);
  }

  const dbClubs = await prisma.club.findMany();
  const clubByLnhSlug = new Map<string, string>();
  const clubByShortName = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubByLnhSlug.set(extIds.lnh.toLowerCase(), c.id);
    clubByShortName.set(c.shortName.toLowerCase(), c.id);
  }

  async function resolveClub(slug: string): Promise<string | null> {
    if (clubByLnhSlug.has(slug)) return clubByLnhSlug.get(slug)!;

    const mapped = LNH_SLUG_MAP[slug];
    if (mapped && clubByShortName.has(mapped.shortName.toLowerCase())) {
      const id = clubByShortName.get(mapped.shortName.toLowerCase())!;
      await prisma.club.update({
        where: { id },
        data: { externalIds: { ...((dbClubs.find((c) => c.id === id)?.externalIds as object) ?? {}), lnh: slug } },
      });
      clubByLnhSlug.set(slug, id);
      return id;
    }

    if (!mapped) return null;

    const newClub = await prisma.club.create({
      data: { name: mapped.fullName, shortName: mapped.shortName, externalIds: { lnh: slug } },
    });
    clubByLnhSlug.set(slug, newClub.id);
    clubByShortName.set(mapped.shortName.toLowerCase(), newClub.id);
    return newClub.id;
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_SEASON");

  await prisma.player.updateMany({ where: { seasonId: season.id }, data: { isActive: false } });

  const existingPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: { id: true, firstName: true, lastName: true, clubId: true },
  });
  const playerByName = new Map<string, string>();
  for (const p of existingPlayers) {
    playerByName.set(`${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`, p.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const clubsMissing = new Set<string>();

  const byPosition = scraped.reduce<Record<string, typeof scraped>>((acc, p) => {
    if (!acc[p.position]) acc[p.position] = [];
    acc[p.position]!.push(p);
    return acc;
  }, {});

  const mvMap = new Map<string, number>();
  for (const [pos, players] of Object.entries(byPosition)) {
    const base = BASE_MV[pos] ?? 7.5;
    const n = players.length;
    players.forEach((p, i) => {
      const delta = n <= 1 ? 0 : 1.0 - (2.0 * i) / (n - 1);
      mvMap.set(p.profileUrl, roundMV(base + delta));
    });
  }

  for (const sp of scraped) {
    const clubId = await resolveClub(sp.lnhClubSlug);
    if (!clubId) {
      clubsMissing.add(sp.lnhClubSlug);
      errors.push(`Club introuvable : ${sp.lnhClubSlug} (${sp.lastName} ${sp.firstName})`);
      skipped++;
      continue;
    }

    const mv = mvMap.get(sp.profileUrl) ?? BASE_MV[sp.position] ?? 7.5;
    const nameKey = `${normalizeName(sp.lastName)}|${normalizeName(sp.firstName)}`;
    const existingId = playerByName.get(nameKey);

    try {
      if (existingId) {
        await prisma.player.update({
          where: { id: existingId },
          data: {
            firstName: sp.firstName,
            lastName: sp.lastName,
            position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
            clubId,
            marketValue: mv,
            isActive: true,
          },
        });
        updated++;
      } else {
        const newPlayer = await prisma.player.create({
          data: {
            seasonId: season.id,
            clubId,
            firstName: sp.firstName,
            lastName: sp.lastName,
            position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
            marketValue: mv,
            isActive: true,
          },
        });
        playerByName.set(nameKey, newPlayer.id);
        created++;
      }
    } catch (err) {
      errors.push(`Erreur ${sp.lastName} ${sp.firstName}: ${String(err).slice(0, 80)}`);
      skipped++;
    }
  }

  console.log(JSON.stringify({
    scraped: scraped.length,
    created,
    updated,
    skipped,
    clubsMissing: Array.from(clubsMissing),
    errors: errors.slice(0, 20),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
