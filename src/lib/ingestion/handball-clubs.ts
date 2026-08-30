// Ingestion de l'annuaire des clubs FFHandball — ARCHITECTURE.md §23.3.
// Source : src/lib/data-providers/ffhandball-clubs.provider.ts (scraping de
// monclub.ffhandball.fr, ~2300 fiches). Upsert idempotent par `slug` (clé
// @unique stable côté monclub) ; le nº d'affiliation FFHandball et le club_hash
// sont conservés dans `externalIds` pour référence.
//
// Lancé par scripts/run-ffhandball-clubs-import.ts (seed manuel + cron mensuel
// cron-monthly.yml). Pas de route /api/cron/* : 2300 fetch séquencés dépassent le
// timeout serverless — le script tourne sur le runner CI, comme
// backfill-warmup-logos.
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import {
  createFfhandballClubsProvider,
  mapWithConcurrency,
  type ExternalHandballClub,
  type FfhandballClubsProvider,
} from "@/lib/data-providers/ffhandball-clubs.provider";

export interface HandballClubsSyncResult {
  scanned: number;
  created: number;
  updated: number;
  failed: number;
  failures: { slug: string; reason: string }[];
}

interface SyncOptions {
  /** Ne traiter que les N premiers slugs (dev / smoke test). */
  limit?: number;
  /** Requêtes de fiches en parallèle (défaut 4). */
  concurrency?: number;
  /** Provider injectable pour les tests. */
  provider?: FfhandballClubsProvider;
  /** Callback de progression (1 appel par fiche traitée). */
  onProgress?: (done: number, total: number) => void;
}

function buildExternalIds(club: ExternalHandballClub): Record<string, string> {
  const ids: Record<string, string> = { ffhandball_hash: club.ffhandballHash };
  if (club.ffhandballId) ids.ffhandball = club.ffhandballId;
  return ids;
}

async function upsertClub(club: ExternalHandballClub): Promise<"created" | "updated"> {
  const data = {
    name: club.name,
    country: "FR",
    city: club.city,
    zipcode: club.zipcode,
    latitude: club.latitude,
    longitude: club.longitude,
    website: club.website,
    externalIds: buildExternalIds(club),
  };

  const existing = await prisma.handballClub.findUnique({
    where: { slug: club.slug },
    select: { id: true, source: true },
  });

  if (!existing) {
    await prisma.handballClub.create({
      data: { ...data, slug: club.slug, source: "FFHANDBALL", verified: true },
    });
    return "created";
  }

  // Ne jamais rétrograder un club que l'admin a promu depuis une saisie libre
  // (source = MANUAL) : on rafraîchit ses coordonnées mais on garde source/verified.
  await prisma.handballClub.update({
    where: { id: existing.id },
    data: existing.source === "MANUAL" ? data : { ...data, source: "FFHANDBALL", verified: true },
  });
  return "updated";
}

export async function syncFfhandballClubs(opts: SyncOptions = {}): Promise<HandballClubsSyncResult> {
  const provider = opts.provider ?? createFfhandballClubsProvider();
  const concurrency = opts.concurrency ?? 4;

  let slugs = await provider.fetchClubSlugs();
  if (slugs.length === 0) {
    throw new IngestionError("ffhandball-monclub : aucun slug de club trouvé", provider.name, true);
  }
  if (opts.limit != null) slugs = slugs.slice(0, opts.limit);

  const result: HandballClubsSyncResult = {
    scanned: slugs.length,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };
  let done = 0;

  await mapWithConcurrency(slugs, concurrency, async (slug) => {
    try {
      const club = await provider.fetchClub(slug);
      if (club === null) {
        // Fiche 404 (club désaffilié) — on ne supprime pas la ligne existante
        // (un membre peut y être lié), on l'ignore simplement.
        result.failures.push({ slug, reason: "fiche introuvable (404)" });
        result.failed++;
        return;
      }
      const outcome = await upsertClub(club);
      result[outcome]++;
    } catch (e) {
      result.failed++;
      result.failures.push({ slug, reason: e instanceof Error ? e.message : String(e) });
    } finally {
      done++;
      opts.onProgress?.(done, slugs.length);
    }
  });

  return result;
}
