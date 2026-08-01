// Télécharge en local les logos des clubs adverses hors DB (D2/Proligue, clubs
// étrangers) apparaissant dans des matchs Warm Up ET Coupe de France (ARCHITECTURE.md
// §19) impliquant au moins un club Daikin StarLigue. Script relancé automatiquement
// par le job backfill-warmup-logos de .github/workflows/cron-daily.yml (le cron
// applicatif sync-warmup/sync-coupe-de-france, eux, ne font que LIRE ces fichiers
// déjà commités — filesystem prod éphémère, public/ non réinscriptible à l'exécution
// sur un build standalone Next.js — voir src/lib/ingestion/warmup.ts).
//
// Les clubs Starligue connus (déjà dans notre DB) sont ignorés — leur logo vient de
// Club.logoUrl, pas de ce script. Même dossier public/clubs/warmup/ pour les deux
// compétitions (un club hors DB a le même logo quelle que soit la compétition).
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLnhScraperProvider } from "../src/lib/data-providers/lnh-scraper.provider";
import { getActiveClubIdBySlug } from "../src/lib/clubs/get-active-club-slugs";

const LNH_SEASONS_ID_2026_2027 = "40";
const SEASON_START_YEAR_2026_2027 = 2026;
const OUT_DIR = path.join(process.cwd(), "public", "clubs", "warmup");

const prisma = new PrismaClient();

async function downloadLogo(slug: string, url: string): Promise<"downloaded" | "already-present" | "failed"> {
  const filePath = path.join(OUT_DIR, `${slug}.png`);
  if (existsSync(filePath)) return "already-present";

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" } });
    if (!res.ok) return "failed";
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filePath, buffer);
    return "downloaded";
  } catch {
    return "failed";
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_ACTIVE_SEASON");

  const provider = createLnhScraperProvider();
  const [warmupMatches, coupeDeFranceMatches] = await Promise.all([
    provider.fetchWarmupMatches(LNH_SEASONS_ID_2026_2027, SEASON_START_YEAR_2026_2027),
    provider.fetchCoupeDeFranceMatches(LNH_SEASONS_ID_2026_2027, SEASON_START_YEAR_2026_2027),
  ]);
  const knownSlugs = new Set((await getActiveClubIdBySlug(season.id)).keys());

  const toDownload = new Map<string, string>(); // slug -> logoUrl
  for (const m of [...warmupMatches, ...coupeDeFranceMatches]) {
    const homeKnown = knownSlugs.has(m.homeClubSlug.toLowerCase());
    const awayKnown = knownSlugs.has(m.awayClubSlug.toLowerCase());
    if (!homeKnown && !awayKnown) continue; // même filtre que syncFriendlyMatches — hors périmètre

    if (!homeKnown) toDownload.set(m.homeClubSlug, m.homeClubLogoUrl);
    if (!awayKnown) toDownload.set(m.awayClubSlug, m.awayClubLogoUrl);
  }

  const results = { downloaded: 0, alreadyPresent: 0, failed: [] as string[] };
  for (const [slug, url] of toDownload) {
    const outcome = await downloadLogo(slug, url);
    if (outcome === "downloaded") results.downloaded++;
    else if (outcome === "already-present") results.alreadyPresent++;
    else results.failed.push(slug);
  }

  console.log(JSON.stringify({ candidates: toDownload.size, ...results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
