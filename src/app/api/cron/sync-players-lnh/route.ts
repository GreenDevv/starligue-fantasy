export const dynamic = "force-dynamic";

// POST /api/cron/sync-players-lnh
// Scrape les joueurs depuis lnh.fr et met à jour les records en DB
// Résolution club : par Club.externalIds.lnh (slug LNH) puis par similarité de nom

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, IngestionError } from "@/lib/data-providers/lnh-scraper.provider";

// Normalise un nom pour la comparaison : minuscules, sans accents, sans tirets
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const provider = createLnhScraperProvider();

  let scrapedPlayers;
  try {
    scrapedPlayers = await provider.fetchPlayers();
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json(
        { error: { code: "SCRAPER_ERROR", message: e.message, recoverable: e.recoverable } },
        { status: 502 }
      );
    }
    throw e;
  }

  if (scrapedPlayers.length === 0) {
    return NextResponse.json(
      { error: { code: "NO_DATA", message: "Le scraper LNH n'a retourné aucun joueur" } },
      { status: 502 }
    );
  }

  // Récupère la saison active
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  // Charge tous les clubs avec leurs externalIds
  const clubs = await prisma.club.findMany();

  // Construit un map lnhSlug → clubId depuis externalIds.lnh
  const clubBySlug = new Map<string, string>();
  const clubByNormalizedName = new Map<string, string>();

  for (const club of clubs) {
    const extIds = (club.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) {
      clubBySlug.set(extIds.lnh.toLowerCase(), club.id);
    }
    clubByNormalizedName.set(normalizeName(club.name), club.id);
    clubByNormalizedName.set(normalizeName(club.shortName), club.id);
  }

  // Charge tous les joueurs de la saison active
  const dbPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: { id: true, firstName: true, lastName: true, clubId: true, position: true, photoUrl: true },
  });

  // Construit un map (normalizedLastName + normalizedFirstName + clubId) → player
  const playerMap = new Map<string, typeof dbPlayers[0]>();
  for (const p of dbPlayers) {
    const key = `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}|${p.clubId}`;
    playerMap.set(key, p);
    // Aussi sans clubId pour fallback
    const keyNoClub = `${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`;
    if (!playerMap.has(keyNoClub)) playerMap.set(keyNoClub, p);
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const sp of scrapedPlayers) {
    // Résout le club
    const slug = sp.lnhClubSlug.toLowerCase();
    let clubId = clubBySlug.get(slug);

    if (!clubId) {
      // Fallback : recherche par nom normalisé
      clubId = clubByNormalizedName.get(normalizeName(sp.lnhClubSlug));
    }

    if (!clubId) {
      errors.push(`Club introuvable pour slug "${sp.lnhClubSlug}" (${sp.lastName} ${sp.firstName})`);
      skipped++;
      continue;
    }

    // Cherche le joueur par nom + club
    const key = `${normalizeName(sp.lastName)}|${normalizeName(sp.firstName)}|${clubId}`;
    const keyNoClub = `${normalizeName(sp.lastName)}|${normalizeName(sp.firstName)}`;
    const existing = playerMap.get(key) ?? playerMap.get(keyNoClub);

    if (existing) {
      // Met à jour seulement si le club correspond ou si pas de photo définie
      const updates: Record<string, unknown> = {};
      if (existing.clubId !== clubId) updates.clubId = clubId;
      // On ne touche pas la position si elle est déjà correcte
      if (Object.keys(updates).length === 0) {
        skipped++;
        continue;
      }

      await prisma.player.update({ where: { id: existing.id }, data: updates });
      updated++;
    } else {
      // Joueur non trouvé — on le crée avec une valeur marchande par défaut
      try {
        await prisma.player.create({
          data: {
            seasonId: season.id,
            clubId,
            firstName: sp.firstName,
            lastName: sp.lastName,
            position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
            marketValue: 7.0,
            isActive: true,
          },
        });
        created++;
      } catch (err) {
        errors.push(`Erreur création ${sp.lastName} ${sp.firstName}: ${String(err)}`);
        skipped++;
      }
    }
  }

  return NextResponse.json({
    data: {
      scraped: scrapedPlayers.length,
      updated,
      created,
      skipped,
      errors: errors.slice(0, 20),
    },
  });
}