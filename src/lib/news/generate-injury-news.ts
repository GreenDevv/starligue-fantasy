// Actu générée quand un admin déclare/lève la blessure d'un joueur (déclenché depuis
// PUT /api/admin/players/[id], src/app/(admin)/admin/players/page.tsx). Saison live
// uniquement — un joueur de la saison Simulation n'a aucun sens ici (curseur
// anti-spoiler, ARCHITECTURE.md §14.6). Best-effort : appelé après que la mise à
// jour du joueur a déjà committé, jamais dans la même transaction (voir le plan —
// une panne d'écriture d'actu ne doit jamais faire régresser la déclaration de
// blessure elle-même).
import { prisma } from "@/lib/db";

interface InjuredPlayer {
  id: string;
  firstName: string;
  lastName: string;
  seasonId: string;
  injuredAt: Date | null;
  club: { id: string; name: string; shortName: string };
}

// reason : motif libre saisi par l'admin (ex. "fin de contrat") pour les cas qui ne
// sont pas une vraie blessure médicale mais doivent quand même passer par le même
// mécanisme (joker médical + email, voir notify-player-injured.ts) — demande
// explicite de l'utilisateur, 2026-08-06 (cas Théophile CAUSSE). Ignoré côté "lève
// la blessure" (pas de sens dans ce sens), et remplace "blessé" par un wording
// neutre plutôt que de forcer le mot dans le texte libre de l'admin.
export async function createInjuryNewsItem(player: InjuredPlayer, reason?: string): Promise<void> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season || season.id !== player.seasonId) return; // joueur hors saison live → pas d'actu

  const isInjured = player.injuredAt !== null;
  const dedupeSuffix = isInjured ? player.injuredAt!.toISOString() : `cleared-${Date.now()}`;
  const title = isInjured
    ? reason
      ? `${player.firstName} ${player.lastName} (${player.club.shortName}) indisponible pour la saison (${reason})`
      : `${player.firstName} ${player.lastName} (${player.club.shortName}) blessé`
    : `${player.firstName} ${player.lastName} (${player.club.shortName}) de retour de blessure`;

  await prisma.newsItem.upsert({
    where: { dedupeKey: `injury:${player.id}:${dedupeSuffix}` },
    create: {
      seasonId: season.id,
      category: "INJURY",
      sourceType: "GENERATED",
      sourceKey: "system",
      title,
      publishedAt: new Date(),
      dedupeKey: `injury:${player.id}:${dedupeSuffix}`,
      clubId: player.club.id,
      playerId: player.id,
    },
    update: {},
  });
}
