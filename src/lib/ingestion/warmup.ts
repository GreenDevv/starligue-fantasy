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

// Logos : les DEUX sources (lnh ET ehf) résolvent désormais leur logo de club hors
// DB de la même façon — localement depuis public/clubs/warmup/ (backfillés par
// scripts/backfill-warmup-logos.ts et scripts/backfill-ehf-logos.ts respectivement,
// même dossier partagé, filesystem prod éphémère — voir resolveLocalWarmupLogoUrl).
// Un premier jet EHF hotlinkait directement le CDN res.ehf.eu ; revenu en arrière
// avant que la volumétrie de clubs augmente (Champions League ET European League) —
// mêmes garanties de disponibilité que Warm Up plutôt que de dépendre de la
// disponibilité continue d'un CDN tiers, et cohérent avec "aucun logo hotlinké,
// jamais" déjà appliqué aux clubs Starligue eux-mêmes. Seule la DIVISION reste
// résolue différemment par source : l'API EHF fournit déjà un code nation à 3
// lettres tout prêt (m.homeClubDivision), lnh.fr nécessite de le dériver du HTML
// (resolveDivision).
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

  // Résultat rentré à la main depuis /admin/friendly-matches (lnh.fr publie
  // souvent le score plusieurs jours après le match, cf. mémoire projet) : à
  // protéger d'un re-scrape qui remettrait le match en attente tant que lnh.fr
  // n'a pas lui-même de résultat définitif — sinon la saisie manuelle serait
  // effacée dès le prochain passage du cron (chaque matin, cf. §19). Dès que
  // lnh.fr publie enfin un vrai résultat (FINISHED + scores non nuls), on lui
  // redonne la main pour de bon (source repasse à LNH_SCRAPER/EHF_SCRAPER) —
  // pas besoin que l'admin pense à annuler sa saisie.
  const existingRows = await prisma.friendlyMatch.findMany({
    where: { dedupeKey: { in: matches.map((m) => `${source}:${m.calendarsId}`) } },
    select: { dedupeKey: true, source: true },
  });
  const existingSourceByDedupeKey = new Map(existingRows.map((r) => [r.dedupeKey, r.source]));

  let upserted = 0;
  let skippedNoStarligueClub = 0;

  for (const m of matches) {
    const homeClubId = clubIdBySlug.get(m.homeClubSlug.toLowerCase()) ?? null;
    const awayClubId = clubIdBySlug.get(m.awayClubSlug.toLowerCase()) ?? null;

    // "ehf" : matches déjà pré-filtrés en amont par groupe (filterToRelevantGroups,
    // src/lib/data-providers/ehf-scraper.provider.ts) — un match entre deux clubs
    // NI l'un ni l'autre Starligue est volontairement gardé s'il appartient à un
    // groupe qui compte un de nos clubs (page "groupe", tous les matchs + classement,
    // demande explicite de l'utilisateur). "lnh" : filtre habituel, pas de notion de
    // groupe équivalente pour Warm Up/Coupe de France.
    if (source === "lnh" && !homeClubId && !awayClubId) {
      skippedNoStarligueClub++;
      continue;
    }

    const dedupeKey = `${source}:${m.calendarsId}`;
    const homeClubLogoUrl = homeClubId ? null : resolveLocalWarmupLogoUrl(m.homeClubSlug);
    const awayClubLogoUrl = awayClubId ? null : resolveLocalWarmupLogoUrl(m.awayClubSlug);
    const homeClubDivision = homeClubId ? null : source === "ehf" ? m.homeClubDivision : resolveDivision(m.homeClubSlug, m.homeClubDivision);
    const awayClubDivision = awayClubId ? null : source === "ehf" ? m.awayClubDivision : resolveDivision(m.awayClubSlug, m.awayClubDivision);
    const scrapedSource = source === "ehf" ? "EHF_SCRAPER" : "LNH_SCRAPER";
    const scrapedHasRealResult = m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null;
    const keepManualOverride = existingSourceByDedupeKey.get(dedupeKey) === "MANUAL" && !scrapedHasRealResult;

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
        source: scrapedSource,
        groupLabel: m.groupLabel,
      },
      // kickoffAt/status/scores peuvent changer d'un run à l'autre (heure provisoire
      // ajustée, match qui se termine) — clubs/compétition/dedupeKey n'ont pas de
      // raison de changer une fois le match identifié par calendars_id. Les logos/
      // divisions aussi : un nouveau passage de scripts/backfill-warmup-logos.ts ou
      // un ajout à WARMUP_FOREIGN_CLUB_DIVISIONS doit se répercuter sans tout
      // ré-upserter depuis zéro. groupLabel : ne change normalement jamais une fois
      // la phase de groupes fixée, mais re-écrit quand même par cohérence avec le
      // reste (idempotent). kickoffAt/status/homeScore/awayScore/source omis si
      // keepManualOverride (voir plus haut) — tout le reste continue d'être
      // rafraîchi normalement.
      //
      // ⚠️ kickoffAt DOIT rester dans ce groupe protégé (bug trouvé le 2026-08-27,
      // ARCHITECTURE.md §19.6) : avant, il était réécrit inconditionnellement à
      // chaque sync même quand source===MANUAL — une correction de date faite dans
      // /admin/friendly-matches se faisait donc systématiquement écraser par le
      // cron du lendemain, avec la mauvaise date scrapée qui revenait "toute seule"
      // sans raison apparente pour l'admin.
      update: {
        ...(keepManualOverride
          ? {}
          : { kickoffAt: m.kickoffAt, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, source: scrapedSource }),
        homeClubLogoUrl,
        homeClubDivision,
        awayClubLogoUrl,
        awayClubDivision,
        groupLabel: m.groupLabel,
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
