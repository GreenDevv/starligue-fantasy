// Fonctions d'ingestion partagées entre les crons et l'admin.
// Toutes les opérations sont idempotentes (upsert par externalId).
// ARCHITECTURE.md §3.2, §4.1

import { prisma } from "@/lib/db";
import type { ExternalFixture, ExternalPlayerStat } from "@/lib/data-providers/types";

export interface SyncResult {
  upserted: number;
  skipped: number;
  errors: string[];
}

// ---------- Clubs ----------

// Résout un club par son externalId API-Sports, puis par shortName en fallback.
async function resolveClub(
  externalId: string,
  shortName: string,
  source: string
): Promise<string | null> {
  // 1. Recherche par externalId
  const byExternal = await prisma.club.findFirst({
    where: {
      externalIds: { path: [source], equals: externalId },
    },
    select: { id: true },
  });
  if (byExternal) return byExternal.id;

  // 2. Fallback : shortName (case-insensitive)
  const byShort = await prisma.club.findFirst({
    where: { shortName: { equals: shortName, mode: "insensitive" } },
    select: { id: true },
  });
  return byShort?.id ?? null;
}

// Met à jour les externalIds d'un club (idempotent)
export async function upsertClubExternalIds(
  clubDbId: string,
  source: string,
  externalId: string
): Promise<void> {
  const club = await prisma.club.findUnique({
    where: { id: clubDbId },
    select: { externalIds: true },
  });
  if (!club) return;

  const ids = (club.externalIds as Record<string, string>) ?? {};
  if (ids[source] === externalId) return; // déjà à jour

  await prisma.club.update({
    where: { id: clubDbId },
    data: { externalIds: { ...ids, [source]: externalId } },
  });
}

// ---------- Fixtures / Results ----------

export async function syncFixtures(
  fixtures: ExternalFixture[],
  seasonId: string,
  source: string = "api_sports"
): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, skipped: 0, errors: [] };

  for (const fx of fixtures) {
    try {
      // Upsert la journée si elle n'existe pas (utile pour les saisons de test)
      const gameweek = await prisma.gameweek.upsert({
        where: { seasonId_number: { seasonId, number: fx.gameweekNumber } },
        update: {},
        create: {
          seasonId,
          number: fx.gameweekNumber,
          // deadline = 1h avant le premier match de la journée (approximation)
          deadlineAt: new Date(fx.kickoffAt.getTime() - 60 * 60 * 1000),
          isScored: false,
        },
        select: { id: true },
      });

      const homeId = await resolveClub(fx.homeExternalId, fx.homeShortName, source);
      const awayId = await resolveClub(fx.awayExternalId, fx.awayShortName, source);
      if (!homeId) {
        result.errors.push(`Club domicile inconnu : ${fx.homeShortName} (id=${fx.homeExternalId})`);
        result.skipped++;
        continue;
      }
      if (!awayId) {
        result.errors.push(`Club ext inconnu : ${fx.awayShortName} (id=${fx.awayExternalId})`);
        result.skipped++;
        continue;
      }

      // Mise à jour des externalIds des clubs
      await Promise.all([
        upsertClubExternalIds(homeId, source, fx.homeExternalId),
        upsertClubExternalIds(awayId, source, fx.awayExternalId),
      ]);

      // Upsert match par externalId ou par (gameweek, home, away)
      const existingByExtId = await prisma.match.findFirst({
        where: { externalIds: { path: [source], equals: fx.externalId } },
        select: { id: true },
      });

      const existingByTeams = existingByExtId
        ? null
        : await prisma.match.findFirst({
            where: {
              gameweekId: gameweek.id,
              homeClubId: homeId,
              awayClubId: awayId,
            },
            select: { id: true },
          });

      const matchId = existingByExtId?.id ?? existingByTeams?.id;

      const statusMap: Record<string, string> = {
        SCHEDULED: "SCHEDULED",
        LIVE: "LIVE",
        FINISHED: "FINISHED",
        POSTPONED: "POSTPONED",
        CANCELLED: "CANCELLED",
      };

      const updateData = {
        kickoffAt: fx.kickoffAt,
        status: (statusMap[fx.status] ?? "SCHEDULED") as
          | "SCHEDULED"
          | "LIVE"
          | "FINISHED"
          | "POSTPONED"
          | "CANCELLED",
        homeScore: fx.homeScore,
        awayScore: fx.awayScore,
      };

      if (matchId) {
        await prisma.match.update({
          where: { id: matchId },
          data: {
            ...updateData,
            externalIds: { [source]: fx.externalId },
          },
        });
      } else {
        await prisma.match.create({
          data: {
            seasonId,
            gameweekId: gameweek.id,
            homeClubId: homeId,
            awayClubId: awayId,
            externalIds: { [source]: fx.externalId },
            ...updateData,
          },
        });
      }
      result.upserted++;
    } catch (err) {
      result.errors.push(
        `Match ${fx.homeShortName}-${fx.awayShortName} J${fx.gameweekNumber}: ${String(err)}`
      );
      result.skipped++;
    }
  }

  return result;
}

// ---------- Ratings (notes LNH) ----------

export async function syncRatings(
  stats: ExternalPlayerStat[],
  matchId: string,
  source: "LNH_SCRAPER" | "CSV" | "MANUAL" | "API_SPORTS"
): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, skipped: 0, errors: [] };

  for (const stat of stats) {
    try {
      const club = await prisma.club.findFirst({
        where: { shortName: { equals: stat.clubShortName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!club) {
        result.errors.push(`Club inconnu : ${stat.clubShortName}`);
        result.skipped++;
        continue;
      }

      const player = await prisma.player.findFirst({
        where: {
          clubId: club.id,
          firstName: { equals: stat.firstName, mode: "insensitive" },
          lastName: { equals: stat.lastName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!player) {
        result.errors.push(
          `Joueur inconnu : ${stat.firstName} ${stat.lastName} (${stat.clubShortName})`
        );
        result.skipped++;
        continue;
      }

      await prisma.playerMatchStat.upsert({
        where: { matchId_playerId: { matchId, playerId: player.id } },
        update: {
          lnhRating: stat.lnhRating,
          played: stat.played,
          source,
        },
        create: {
          matchId,
          playerId: player.id,
          lnhRating: stat.lnhRating,
          played: stat.played,
          source,
        },
      });
      result.upserted++;
    } catch (err) {
      result.errors.push(
        `Stat ${stat.firstName} ${stat.lastName}: ${String(err)}`
      );
      result.skipped++;
    }
  }

  return result;
}
