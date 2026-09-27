// Contexte de rapprochement lnh.fr → Player partagé par toutes les ingestions de
// boxscore (définitif, page match à la demande, flux live) : charge une fois
// l'effectif de la saison + la table slug club lnh → Club.id, puis résout chaque
// ligne via src/lib/players/lnh-player-resolver.ts (slug → dernier nom lnh.fr →
// notre nom). persistLnhIdentities apprend/rafraîchit Player.externalIds.lnh_slug /
// lnh_name à partir des lignes rapprochées — à appeler uniquement depuis un chemin
// qui ÉCRIT déjà (pas depuis l'analyse lecture seule des corrections LNH).
import { prisma } from "@/lib/db";
import {
  buildLnhPlayerIndex,
  lnhIdentityPatch,
  resolveLnhPlayer,
  type LnhMatchMethod,
  type LnhPlayerIndex,
} from "@/lib/players/lnh-player-resolver";

export interface LnhResolutionContext {
  index: LnhPlayerIndex;
  clubIdBySlug: Map<string, string>;
  externalIdsByPlayerId: Map<string, unknown>;
}

export interface LnhRowRef {
  profileSlug: string | null;
  lnhClubSlug: string;
  lastName: string;
  firstName: string;
}

export async function loadLnhResolutionContext(seasonId: string, clubIds?: string[]): Promise<LnhResolutionContext> {
  const [players, clubs] = await Promise.all([
    prisma.player.findMany({
      where: { seasonId, ...(clubIds ? { clubId: { in: clubIds } } : {}) },
      select: { id: true, firstName: true, lastName: true, clubId: true, externalIds: true },
    }),
    prisma.club.findMany({ select: { id: true, externalIds: true } }),
  ]);
  const clubIdBySlug = new Map<string, string>();
  for (const c of clubs) {
    const slug = (c.externalIds as Record<string, string> | null)?.lnh;
    if (slug) clubIdBySlug.set(slug.toLowerCase(), c.id);
  }
  return {
    index: buildLnhPlayerIndex(players),
    clubIdBySlug,
    externalIdsByPlayerId: new Map(players.map((p) => [p.id, p.externalIds])),
  };
}

export function resolveLnhRow(
  ctx: LnhResolutionContext,
  row: LnhRowRef
): { playerId: string; method: LnhMatchMethod } | null {
  return resolveLnhPlayer(ctx.index, {
    slug: row.profileSlug,
    lastName: row.lastName,
    firstName: row.firstName,
    clubId: ctx.clubIdBySlug.get(row.lnhClubSlug.toLowerCase()) ?? null,
  });
}

// Écrit les slug/nom lnh.fr appris. Les conflits (joueur déjà rattaché à un autre
// slug) ne sont jamais écrasés, juste remontés pour relecture humaine.
export async function persistLnhIdentities(
  ctx: LnhResolutionContext,
  matched: { playerId: string; row: LnhRowRef }[]
): Promise<{ updated: number; conflicts: string[] }> {
  const conflicts: string[] = [];
  const updates: { id: string; externalIds: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  for (const { playerId, row } of matched) {
    if (seen.has(playerId)) continue;
    seen.add(playerId);
    const patch = lnhIdentityPatch(ctx.externalIdsByPlayerId.get(playerId), {
      slug: row.profileSlug,
      lastName: row.lastName,
      firstName: row.firstName,
    });
    if (!patch) continue;
    if (patch.conflict) {
      conflicts.push(`${playerId}: slug lnh.fr ${row.profileSlug} ≠ slug stocké`);
      continue;
    }
    updates.push({ id: playerId, externalIds: patch.externalIds });
    ctx.externalIdsByPlayerId.set(playerId, patch.externalIds);
  }
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.player.update({ where: { id: u.id }, data: { externalIds: u.externalIds as object } }))
    );
  }
  if (conflicts.length > 0) console.warn("[lnh-player-identity] conflits de slug :", conflicts);
  return { updated: updates.length, conflicts };
}
