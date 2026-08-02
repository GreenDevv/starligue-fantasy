// Télécharge en local les logos des clubs adverses hors DB (clubs européens)
// apparaissant dans des matchs EHF Champions League ET European League
// (ARCHITECTURE.md §19) impliquant au moins un club Daikin StarLigue. Même
// dossier public/clubs/warmup/ que scripts/backfill-warmup-logos.ts (un club hors
// DB a le même logo quelle que soit la compétition, cf. ce script) — relancé
// automatiquement par le job backfill-warmup-logos de .github/workflows/cron-daily.yml.
//
// Contrairement à Warm Up (URLs lnh.fr, considérées instables pour du hotlink
// direct), l'API EHF fournit des URLs de logo sur un CDN stable (res.ehf.eu) — mais
// syncFriendlyMatches (src/lib/ingestion/warmup.ts) ne les hotlinke plus depuis le
// 2026-08-02 : mêmes garanties de disponibilité pour tous les adversaires hors DB,
// quelle que soit la source. Ce script re-scrape donc l'API EHF lui-même (les URLs
// de logo ne sont plus conservées dans FriendlyMatch une fois le chemin local
// résolu) plutôt que de les lire depuis la DB — même principe que
// backfill-warmup-logos.ts qui re-scrape lnh.fr au lieu de lire FriendlyMatch.
//
// Deux sources de logo côté EHF, dans cet ordre de priorité (vérifié le
// 2026-08-02) : la page "clubs" de la saison (fetchChampionsLeagueClubLogos/
// fetchEuropeanLeagueClubLogos) d'abord — l'API matchs (logoBig/logoSmall,
// consommée par fetchChampionsLeagueMatches/fetchEuropeanLeagueMatches) s'est
// révélée incomplète : 5 des 9 adversaires EHF CL 2026/27 de nos clubs (Aalborg
// Håndbold, Barça, HC Vardar 1961, Orlen Wisla Plock, RK Celje Pivovarna Laško)
// n'ont AUCUN logo sur AUCUN de leurs matchs, alors que la page "clubs" les liste
// tous. Le fallback sur l'URL de l'API matchs reste utile si un club apparaît en
// match mais pas (encore) sur la page clubs.
//
// **Piège découvert le 2026-08-02, à connaître avant de "corriger" ce script** :
// même la page "clubs" EHF sert des logos avec un FOND BLANC opaque pour plusieurs
// clubs (Dinamo Bucuresti, HC Zagreb, HC Vardar 1961, Orlen Wisla Plock, RK Celje
// Pivovarna Laško, MT Melsungen — repéré par l'utilisateur, incohérent avec le
// reste des logos du site, tous en fond transparent). `downloadLogo` ne re-télécharge
// JAMAIS un fichier déjà présent (`existsSync`) — ces 6 fichiers ont donc été
// remplacés À LA MAIN par de meilleures versions à fond transparent (Wikipedia/
// Wikimedia Commons pour 5, SVG officiel rk-zagreb.hr rastérisé pour HC Zagreb,
// aucune source EHF n'en avait de correcte) et resteront protégés indéfiniment
// contre un futur run de ce script, qui ne les verra jamais comme "manquants".
// Si un de ces 6 clubs disparaît puis réapparaît un jour (fichier supprimé entre
// temps), vérifier à la main la transparence du logo re-téléchargé avant de le
// commiter — ne pas supposer que la source EHF s'est améliorée entre-temps.
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchChampionsLeagueMatches,
  fetchEuropeanLeagueMatches,
  fetchChampionsLeagueClubLogos,
  fetchEuropeanLeagueClubLogos,
} from "../src/lib/data-providers/ehf-scraper.provider";
import { getActiveClubIdBySlug, getActiveClubSlugsAndNames } from "../src/lib/clubs/get-active-club-slugs";

const OUT_DIR = path.join(process.cwd(), "public", "clubs", "warmup");

const prisma = new PrismaClient();

async function downloadLogo(slug: string, url: string): Promise<"downloaded" | "already-present" | "no-logo" | "failed"> {
  if (!url) return "no-logo"; // certains clubs EHF n'ont tout simplement aucun logo publié (vérifié le 2026-08-02)
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

  const knownClubs = await getActiveClubSlugsAndNames(season.id);
  const knownSlugs = new Set((await getActiveClubIdBySlug(season.id)).keys());

  // European League 2026/27 peut ne pas encore être publiée côté EHF (404) — pas
  // une vraie erreur pour ce script, juste rien à backfiller de ce côté-là tant que
  // ce n'est pas le cas (même comportement que sync-european-league).
  const [clMatches, elMatches, clLogos, elLogos] = await Promise.all([
    fetchChampionsLeagueMatches(knownClubs).catch(() => []),
    fetchEuropeanLeagueMatches(knownClubs).catch(() => []),
    fetchChampionsLeagueClubLogos().catch(() => new Map<string, string>()),
    fetchEuropeanLeagueClubLogos().catch(() => new Map<string, string>()),
  ]);
  const clubLogosByName = new Map([...clLogos, ...elLogos]);

  const toDownload = new Map<string, string>(); // slug -> logoUrl
  for (const m of [...clMatches, ...elMatches]) {
    const homeKnown = knownSlugs.has(m.homeClubSlug.toLowerCase());
    const awayKnown = knownSlugs.has(m.awayClubSlug.toLowerCase());
    if (!homeKnown && !awayKnown) continue; // même filtre que syncFriendlyMatches — hors périmètre

    if (!homeKnown) toDownload.set(m.homeClubSlug, clubLogosByName.get(m.homeClubName) ?? m.homeClubLogoUrl);
    if (!awayKnown) toDownload.set(m.awayClubSlug, clubLogosByName.get(m.awayClubName) ?? m.awayClubLogoUrl);
  }

  const results = { downloaded: 0, alreadyPresent: 0, noLogo: 0, failed: [] as string[] };
  for (const [slug, url] of toDownload) {
    const outcome = await downloadLogo(slug, url);
    if (outcome === "downloaded") results.downloaded++;
    else if (outcome === "already-present") results.alreadyPresent++;
    else if (outcome === "no-logo") results.noLogo++;
    else results.failed.push(slug);
  }

  console.log(JSON.stringify({ candidates: toDownload.size, ...results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
