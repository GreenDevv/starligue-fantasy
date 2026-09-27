// Rattache chaque joueur lnh.fr de la saison en cours à son Player via le slug de
// profil lnh.fr (Player.externalIds.lnh_slug + lnh_name) — cf.
// src/lib/players/lnh-player-resolver.ts pour le pourquoi.
//
// Sources lnh.fr : la liste stats par poste (fetchPlayers, porte le slug profil) et
// la liste officielle avec photos (fetchPlayerPhotos). Le nom de fichier de la photo
// garde l'ANCIEN nom d'un joueur renommé par la LNH (« MONTE Bryan » → photo
// `monte-dos-santos-hugo__picture…`) : dernier recours pour le rapprocher.
//
// Dry-run par défaut (rien n'est écrit). `apply` écrit les identités ;
// `createMissing` crée en plus les joueurs lnh.fr absents de l'effectif
// (idempotent : retrouvés par slug au run suivant), valorisés d'après leur Score
// LNH de la saison en cours (valueNewcomersFromSeasonScores, grille validée 27/09).
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, type ScrapedPlayer } from "@/lib/data-providers/lnh-scraper.provider";
import {
  buildLnhPlayerIndex,
  lnhIdentityPatch,
  lnhNameKey,
  lnhSlugFromProfileUrl,
  resolveLnhPlayer,
  type LnhMatchMethod,
} from "@/lib/players/lnh-player-resolver";
import {
  DEFAULT_NEWCOMER_VALUATION_CONFIG,
  valueNewcomersFromSeasonScores,
  type NewcomerValuationConfig,
} from "@/lib/players/valuation";
import type { Position } from "@/lib/squad/validation";

export interface RosterIdentitySyncOptions {
  apply: boolean;
  createMissing: boolean;
  valuation?: NewcomerValuationConfig;
}

export interface RosterIdentitySyncReport {
  lnhPlayers: number;
  matched: Record<LnhMatchMethod | "photo", number>;
  identitiesWritten: number;
  renamedByLnh: { playerId: string; ours: string; lnh: string; slug: string }[];
  clubChanges: { playerId: string; name: string; ourClubId: string; lnhClubId: string }[];
  conflicts: string[];
  missing: {
    slug: string;
    name: string;
    club: string;
    position: string;
    matchesPlayed: number;
    totalScore: number;
    marketValue: number;
  }[];
  created: number;
  unknownClubs: string[];
}

// "https://…/small_monte-dos-santos-hugo__picture__2026-2027-…png" → "monte dos santos hugo"
function nameKeyFromPhotoUrl(url: string | null): string | null {
  const m = url?.match(/\/(?:small_)?([a-z0-9-]+)__picture__/i);
  return m ? m[1]!.replace(/-/g, " ").toLowerCase() : null;
}

export async function syncLnhRosterIdentities(opts: RosterIdentitySyncOptions): Promise<RosterIdentitySyncReport> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_SEASON");

  const provider = createLnhScraperProvider();
  const [lnhPlayers, photos, seasonScores] = await Promise.all([
    provider.fetchPlayers(),
    provider.fetchPlayerPhotos("40"),
    provider.fetchSeasonScores("40"),
  ]);

  const clubs = await prisma.club.findMany({ select: { id: true, shortName: true, displayName: true, externalIds: true } });
  const clubIdBySlug = new Map<string, string>();
  for (const c of clubs) {
    const slug = (c.externalIds as Record<string, string> | null)?.lnh;
    if (slug) clubIdBySlug.set(slug.toLowerCase(), c.id);
  }
  const clubShortById = new Map(clubs.map((c) => [c.id, c.shortName]));

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: { id: true, firstName: true, lastName: true, clubId: true, externalIds: true },
  });
  const index = buildLnhPlayerIndex(players);
  const playerById = new Map(players.map((p) => [p.id, p]));

  const photoKeyByLnhName = new Map<string, string>();
  for (const ph of photos) {
    const k = nameKeyFromPhotoUrl(ph.photoUrl);
    if (k) photoKeyByLnhName.set(`${lnhNameKey(ph.lastName, ph.firstName)}|${ph.lnhClubSlug.toLowerCase()}`, k);
  }

  const report: RosterIdentitySyncReport = {
    lnhPlayers: lnhPlayers.length,
    matched: { slug: 0, lnh_name: 0, name: 0, photo: 0 },
    identitiesWritten: 0,
    renamedByLnh: [],
    clubChanges: [],
    conflicts: [],
    missing: [],
    created: 0,
    unknownClubs: [],
  };

  // Score LNH saison de chaque joueur lnh.fr (référence de valorisation), clé = slug.
  const scoreByNameClub = new Map(
    seasonScores.map((s) => [`${lnhNameKey(s.lastName, s.firstName)}|${s.lnhClubSlug.toLowerCase()}`, s])
  );
  const reference = lnhPlayers.flatMap((sp) => {
    const slug = lnhSlugFromProfileUrl(sp.profileUrl);
    const sc = scoreByNameClub.get(`${lnhNameKey(sp.lastName, sp.firstName)}|${sp.lnhClubSlug.toLowerCase()}`);
    return slug && sc
      ? [{ playerId: slug, position: sp.position as Position, matchesPlayed: sc.matchesPlayed, totalScore: sc.totalScore }]
      : [];
  });
  const referenceBySlug = new Map(reference.map((r) => [r.playerId, r]));

  const writes: { id: string; externalIds: Record<string, unknown> }[] = [];
  const toCreate: { sp: ScrapedPlayer; slug: string; clubId: string }[] = [];
  const claimed = new Map<string, string>(); // playerId → slug déjà attribué sur ce run

  for (const sp of lnhPlayers) {
    const slug = lnhSlugFromProfileUrl(sp.profileUrl);
    if (!slug) continue;
    const clubId = clubIdBySlug.get(sp.lnhClubSlug.toLowerCase()) ?? null;
    if (!clubId) {
      report.unknownClubs.push(`${sp.lnhClubSlug} (${sp.lastName} ${sp.firstName})`);
      continue;
    }

    let resolved: { playerId: string; method: LnhMatchMethod | "photo" } | null = resolveLnhPlayer(index, {
      slug,
      lastName: sp.lastName,
      firstName: sp.firstName,
      clubId,
    });
    if (!resolved) {
      const photoKey = photoKeyByLnhName.get(`${lnhNameKey(sp.lastName, sp.firstName)}|${sp.lnhClubSlug.toLowerCase()}`);
      const id = photoKey ? index.byName.get(`${photoKey}|${clubId}`) : undefined;
      if (id) resolved = { playerId: id, method: "photo" };
    }

    if (!resolved) {
      const ref = referenceBySlug.get(slug);
      report.missing.push({
        slug,
        name: `${sp.lastName} ${sp.firstName}`,
        club: clubShortById.get(clubId) ?? sp.lnhClubSlug,
        position: sp.position,
        matchesPlayed: ref?.matchesPlayed ?? 0,
        totalScore: ref?.totalScore ?? 0,
        marketValue: 0, // renseigné après la boucle (dépend de toute la référence)
      });
      toCreate.push({ sp, slug, clubId });
      continue;
    }

    const other = claimed.get(resolved.playerId);
    if (other && other !== slug) {
      report.conflicts.push(`${resolved.playerId} revendiqué par ${other} et ${slug}`);
      continue;
    }
    claimed.set(resolved.playerId, slug);
    report.matched[resolved.method]++;

    const player = playerById.get(resolved.playerId)!;
    if (player.clubId !== clubId) {
      report.clubChanges.push({ playerId: player.id, name: `${player.lastName} ${player.firstName}`, ourClubId: player.clubId, lnhClubId: clubId });
    }
    if (lnhNameKey(player.lastName, player.firstName) !== lnhNameKey(sp.lastName, sp.firstName)) {
      report.renamedByLnh.push({ playerId: player.id, ours: `${player.lastName} ${player.firstName}`, lnh: `${sp.lastName} ${sp.firstName}`, slug });
    }

    const patch = lnhIdentityPatch(player.externalIds, { slug, lastName: sp.lastName, firstName: sp.firstName });
    if (!patch) continue;
    if (patch.conflict) {
      report.conflicts.push(`${player.lastName} ${player.firstName} (${player.id}) : slug stocké ≠ ${slug}`);
      continue;
    }
    writes.push({ id: player.id, externalIds: patch.externalIds });
  }

  const newcomerValues = valueNewcomersFromSeasonScores(
    reference,
    report.missing.map((m) => m.slug),
    opts.valuation ?? DEFAULT_NEWCOMER_VALUATION_CONFIG
  );
  for (const m of report.missing) m.marketValue = newcomerValues.get(m.slug)!;

  report.identitiesWritten = writes.length;
  if (opts.apply && writes.length > 0) {
    await prisma.$transaction(
      writes.map((w) => prisma.player.update({ where: { id: w.id }, data: { externalIds: w.externalIds as object } }))
    );
  }

  if (opts.apply && opts.createMissing) {
    for (const { sp, slug, clubId } of toCreate) {
      // Idempotent : un joueur déjà créé sur un run précédent est retrouvé par slug.
      const existing = await prisma.player.findFirst({
        where: { seasonId: season.id, externalIds: { path: ["lnh_slug"], equals: slug } },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.player.create({
        data: {
          seasonId: season.id,
          clubId,
          firstName: sp.firstName,
          lastName: sp.lastName,
          position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
          marketValue: newcomerValues.get(slug)!,
          isActive: true,
          externalIds: { lnh_slug: slug, lnh_name: lnhNameKey(sp.lastName, sp.firstName) },
        },
      });
      report.created++;
    }
  }

  return report;
}
