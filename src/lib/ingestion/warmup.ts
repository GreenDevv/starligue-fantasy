// Ingestion des matchs hors championnat (mode "Warm Up", Coupe de France, EHF
// Champions League, EHF European League — ARCHITECTURE.md §19) — voir
// src/lib/data-providers/lnh-scraper.provider.ts::fetchWarmupMatches/
// fetchCoupeDeFranceMatches et src/lib/data-providers/ehf-scraper.provider.ts::
// fetchChampionsLeagueMatches/fetchEuropeanLeagueMatches pour les sources.
// Contrairement à Match (championnat), pas de notion de journée/deadline/classement
// ici — juste une liste de rencontres, upsert idempotent par dedupeKey (même
// convention que NewsItem, cf. src/lib/news/sync.ts). Les quatre compétitions
// partagent la même table FriendlyMatch (competitionLabel les distingue à
// l'affichage) et donc la même mécanique d'ingestion (syncFriendlyMatches) — seules
// la source scrapée et la résolution logo/division des clubs hors DB diffèrent
// (`source`, voir plus bas). Le nom de ce fichier ("warmup") est resté historique
// (première compétition couverte).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, type ScrapedWarmupMatch } from "@/lib/data-providers/lnh-scraper.provider";
import { fetchChampionsLeagueMatches, fetchEuropeanLeagueMatches } from "@/lib/data-providers/ehf-scraper.provider";
import { getActiveClubIdBySlug, getActiveClubSlugsAndNames } from "@/lib/clubs/get-active-club-slugs";
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
// passage du script. Même dossier public/clubs/warmup/ pour Warm Up ET Coupe de
// France (adversaires hors DB des deux compétitions confondus, pas de raison de
// séparer : un club hors DB a le même logo quelle que soit la compétition).
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

// "lnh" (Warm Up/Coupe de France) : logos hors DB résolus localement depuis
// public/clubs/warmup/ (backfillés à la main, filesystem prod éphémère — voir
// resolveLocalWarmupLogoUrl) et division dérivée du HTML lnh.fr. "ehf" (EHF
// Champions League ET European League, même API) : l'API fournit déjà une URL de
// logo stable (CDN res.ehf.eu, pas de session/expiration observée) et un code
// nation à 3 lettres tout prêt — hotlinkée directement, pas besoin de réinventer un
// pipeline de backfill pour cette source (contrairement à lnh.fr, dont les URLs de
// logo ne sont pas considérées assez stables pour du hotlink direct, cf.
// ARCHITECTURE.md §19).
type FriendlySource = "lnh" | "ehf";

/**
 * Filtre : garde un match seulement si au moins un des deux clubs a un effectif
 * pour la saison active (getActiveClubIdBySlug — pas juste "existe dans la table
 * Club", qui contient aussi d'anciens clubs relégués comme Dijon/Istres, présents
 * pour le Mode Simulation 2025/26 mais pas la saison Daikin StarLigue 2026/27).
 * Cœur partagé par syncWarmupMatches/syncCoupeDeFranceMatches/
 * syncChampionsLeagueMatches — seules la liste de matchs déjà scrapée/filtrée par
 * compétition en amont et la source diffèrent.
 */
async function syncFriendlyMatches(
  seasonId: string,
  matches: ScrapedWarmupMatch[],
  source: FriendlySource = "lnh"
): Promise<WarmupSyncResult> {
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

    const dedupeKey = `${source}:${m.calendarsId}`;
    const homeClubLogoUrl = homeClubId
      ? null
      : source === "ehf"
        ? (m.homeClubLogoUrl || null)
        : resolveLocalWarmupLogoUrl(m.homeClubSlug);
    const awayClubLogoUrl = awayClubId
      ? null
      : source === "ehf"
        ? (m.awayClubLogoUrl || null)
        : resolveLocalWarmupLogoUrl(m.awayClubSlug);
    const homeClubDivision = homeClubId ? null : source === "ehf" ? m.homeClubDivision : resolveDivision(m.homeClubSlug, m.homeClubDivision);
    const awayClubDivision = awayClubId ? null : source === "ehf" ? m.awayClubDivision : resolveDivision(m.awayClubSlug, m.awayClubDivision);

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
        source: source === "ehf" ? "EHF_SCRAPER" : "LNH_SCRAPER",
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

export async function syncWarmupMatches(
  seasonId: string,
  lnhSeasonsId: string,
  seasonStartYear: number
): Promise<WarmupSyncResult> {
  const provider = createLnhScraperProvider();
  const matches = await provider.fetchWarmupMatches(lnhSeasonsId, seasonStartYear);
  return syncFriendlyMatches(seasonId, matches);
}

export async function syncCoupeDeFranceMatches(
  seasonId: string,
  lnhSeasonsId: string,
  seasonStartYear: number
): Promise<WarmupSyncResult> {
  const provider = createLnhScraperProvider();
  const matches = await provider.fetchCoupeDeFranceMatches(lnhSeasonsId, seasonStartYear);
  return syncFriendlyMatches(seasonId, matches);
}

// EHF Champions League Men 2026/27 — clubs Starligue engagés à ce jour : HBC
// Nantes, Montpellier Handball, Paris Saint-Germain (src/lib/data-providers/
// ehf-scraper.provider.ts). Aucun paramètre seasonsId/seasonStartYear ici
// contrairement à syncWarmupMatches/syncCoupeDeFranceMatches : la saison EHF
// (2026/27) est encodée dans l'URL de la page scrapée, pas de notion de
// "seasons_id" partagée avec lnh.fr. `knownClubs` (slug lnh.fr + nom) sert à
// résoudre les équipes EHF par correspondance de nom (aucun identifiant partagé
// entre les deux sources) — voir resolveClubSlug dans le provider.
export async function syncChampionsLeagueMatches(seasonId: string): Promise<WarmupSyncResult> {
  const knownClubs = await getActiveClubSlugsAndNames(seasonId);
  const matches = await fetchChampionsLeagueMatches(knownClubs);
  return syncFriendlyMatches(seasonId, matches, "ehf");
}

// EHF European League Men 2026/27 — 2ᵉ compétition européenne EHF, même mécanique
// exacte que syncChampionsLeagueMatches (même API, même table FriendlyMatch, même
// résolution de club par nom). Demande explicite de l'utilisateur le 2026-08-02,
// alors que la page saison n'existe pas encore côté EHF
// (`https://ehfel.eurohandball.com/men/2026-27/matches/` → 404 au moment d'écrire ce
// code, confirmé par l'utilisateur ET vérifié) : grâce à la découverte dynamique des
// identifiants de compétition (voir le provider), ce cron commencera à fonctionner
// tout seul dès qu'EHF publiera la page — `fetchEhfCompetitionMatches` lève une
// IngestionError récupérable en attendant (page 404), sans bloquer les autres jobs
// du cron quotidien.
export async function syncEuropeanLeagueMatches(seasonId: string): Promise<WarmupSyncResult> {
  const knownClubs = await getActiveClubSlugsAndNames(seasonId);
  const matches = await fetchEuropeanLeagueMatches(knownClubs);
  return syncFriendlyMatches(seasonId, matches, "ehf");
}
