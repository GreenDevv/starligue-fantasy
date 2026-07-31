// Ingestion des matchs de préparation (mode "Warm Up", ARCHITECTURE.md) — voir
// src/lib/data-providers/lnh-scraper.provider.ts::fetchWarmupMatches pour la source
// (compétition "Warm Up -" officiellement labellisée par la LNH, calendrier global
// univers=matchs-6892, distinct du calendrier Daikin StarLigue déjà scrapé).
// Contrairement à Match (championnat), pas de notion de journée/deadline/classement
// ici — juste une liste de rencontres amicales, upsert idempotent par dedupeKey
// (même convention que NewsItem, cf. src/lib/news/sync.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { getActiveClubIdBySlug } from "@/lib/clubs/get-active-club-slugs";
import { WARMUP_FOREIGN_CLUB_DIVISIONS } from "@/lib/clubs/warmup-foreign-divisions";

export interface WarmupSyncResult {
  fetched: number;
  upserted: number;
  skippedNoStarligueClub: number;
}

// Logos des clubs hors DB (D2, étrangers) : pas de fetch/écriture à l'exécution
// (filesystem éphémère en prod, `public/` n'est de toute façon pas réinscriptible à
// chaud sur un build standalone Next.js) — seulement une LECTURE d'assets déjà
// commités au repo par scripts/backfill-warmup-logos.ts. Un club pas encore
// backfillé retombe simplement sur les initiales (ClubLogo) jusqu'au prochain
// passage du script.
function resolveLocalWarmupLogoUrl(slug: string): string | null {
  const path = join(process.cwd(), "public", "clubs", "warmup", `${slug}.png`);
  return existsSync(path) ? `/clubs/warmup/${slug}.png` : null;
}

// "proligue" → "Proligue" — capitalise chaque segment séparé par un tiret.
function formatHrefDivision(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function resolveDivision(slug: string, hrefDivision: string | null): string | null {
  // "daikin-starligue" apparaît ici pour un club RELÉGUÉ (ex: Dijon/Istres, encore
  // taggués ainsi par lnh.fr lui-même bien qu'absents de notre effectif actif —
  // voir getActiveClubIdBySlug) : afficher "Daikin Starligue" en info-bulle pour un
  // adversaire qu'on vient de traiter comme hors Starligue serait trompeur.
  if (hrefDivision && hrefDivision !== "daikin-starligue") return formatHrefDivision(hrefDivision);
  return WARMUP_FOREIGN_CLUB_DIVISIONS[slug.toLowerCase()] ?? null;
}

/**
 * Filtre : garde un match seulement si au moins un des deux clubs a un effectif
 * pour la saison active (getActiveClubIdBySlug — pas juste "existe dans la table
 * Club", qui contient aussi d'anciens clubs relégués comme Dijon/Istres, présents
 * pour le Mode Simulation 2025/26 mais pas la saison Daikin StarLigue 2026/27).
 */
export async function syncWarmupMatches(
  seasonId: string,
  lnhSeasonsId: string,
  seasonStartYear: number
): Promise<WarmupSyncResult> {
  const provider = createLnhScraperProvider();
  const matches = await provider.fetchWarmupMatches(lnhSeasonsId, seasonStartYear);
  const clubIdBySlug = await getActiveClubIdBySlug(seasonId);

  let upserted = 0;
  let skippedNoStarligueClub = 0;

  for (const m of matches) {
    const homeClubId = clubIdBySlug.get(m.homeClubSlug.toLowerCase()) ?? null;
    const awayClubId = clubIdBySlug.get(m.awayClubSlug.toLowerCase()) ?? null;

    if (!homeClubId && !awayClubId) {
      skippedNoStarligueClub++;
      continue;
    }

    const dedupeKey = `lnh:${m.calendarsId}`;
    const homeClubLogoUrl = homeClubId ? null : resolveLocalWarmupLogoUrl(m.homeClubSlug);
    const awayClubLogoUrl = awayClubId ? null : resolveLocalWarmupLogoUrl(m.awayClubSlug);
    const homeClubDivision = homeClubId ? null : resolveDivision(m.homeClubSlug, m.homeClubDivision);
    const awayClubDivision = awayClubId ? null : resolveDivision(m.awayClubSlug, m.awayClubDivision);

    await prisma.friendlyMatch.upsert({
      where: { dedupeKey },
      create: {
        seasonId,
        competitionLabel: m.competitionLabel,
        kickoffAt: m.kickoffAt,
        status: m.status,
        homeClubId,
        homeClubName: m.homeClubName,
        homeClubLogoUrl,
        homeClubDivision,
        awayClubId,
        awayClubName: m.awayClubName,
        awayClubLogoUrl,
        awayClubDivision,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        dedupeKey,
      },
      // kickoffAt/status/scores peuvent changer d'un run à l'autre (heure provisoire
      // ajustée, match qui se termine) — clubs/compétition/dedupeKey n'ont pas de
      // raison de changer une fois le match identifié par calendars_id. Les logos/
      // divisions aussi : un nouveau passage de scripts/backfill-warmup-logos.ts ou
      // un ajout à WARMUP_FOREIGN_CLUB_DIVISIONS doit se répercuter sans tout
      // ré-upserter depuis zéro.
      update: {
        kickoffAt: m.kickoffAt,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeClubLogoUrl,
        homeClubDivision,
        awayClubLogoUrl,
        awayClubDivision,
      },
    });
    upserted++;
  }

  return { fetched: matches.length, upserted, skippedNoStarligueClub };
}
