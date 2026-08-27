export const dynamic = "force-dynamic";

// POST /api/admin/import/lnh-player-photos — scrape et applique les photos joueurs
// depuis /daikin-starligue/joueurs (lnh.fr, désormais une source de vraies photos
// détourées fond transparent pour la majorité des joueurs, ~300 KB en une requête,
// pas les silhouettes génériques constatées jusqu'au 2026-08-27, cf.
// src/lib/data-providers/lnh-scraper.provider.ts::fetchPlayerPhotos). Distinct de
// POST /api/admin/import/player-photos (dataset JSON curaté, sites officiels de
// club, hotlink) — les deux coexistent, celui-ci est désormais la source la plus
// complète et à privilégier au fil de la saison.
//
// Un joueur encore sur la silhouette générique lnh.fr est exclu des lignes envoyées
// à matchPlayerPhotoRows (jamais "remplacé" par un placeholder) — ne touche donc
// jamais un photoUrl déjà renseigné par ailleurs (dataset club) tant que lnh.fr n'a
// pas sa propre vraie photo.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { matchPlayerPhotoRows, type PlayerPhotoRow } from "@/lib/players/photo-import";

const LNH_SEASONS_ID_2026_2027 = "40";

export async function POST() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const provider = createLnhScraperProvider();
  let scraped;
  try {
    scraped = await provider.fetchPlayerPhotos(LNH_SEASONS_ID_2026_2027);
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err) } },
      { status: recoverable ? 502 : 500 }
    );
  }

  const clubs = await prisma.club.findMany({ select: { shortName: true, externalIds: true } });
  const shortNameBySlug = new Map<string, string>();
  for (const c of clubs) {
    const slug = (c.externalIds as Record<string, string> | null)?.lnh;
    if (slug) shortNameBySlug.set(slug.toLowerCase(), c.shortName);
  }

  const rows: PlayerPhotoRow[] = scraped
    .filter((r) => r.photoUrl !== null)
    .flatMap((r) => {
      const club = shortNameBySlug.get(r.lnhClubSlug.toLowerCase());
      if (!club) return []; // club lnh.fr non résolu (hors périmètre Starligue) — ignoré plutôt qu'un faux "non trouvé"
      return [{ nom: r.lastName, prenom: r.firstName, club, photoUrl: r.photoUrl! }];
    });

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const { updates, unchanged, unmatched } = matchPlayerPhotoRows(
    rows,
    players.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      clubShortName: p.club.shortName,
      photoUrl: p.photoUrl,
    }))
  );

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.player.update({ where: { id: u.playerId }, data: { photoUrl: u.newPhotoUrl } }))
    );
  }

  return NextResponse.json({
    data: {
      totalRows: rows.length,
      scrapedWithPhoto: scraped.filter((r) => r.photoUrl !== null).length,
      scrapedTotal: scraped.length,
      updated: updates.length,
      unchanged: unchanged.length,
      unmatched: unmatched.map((u) => ({ ...u.row, reason: u.reason })),
    },
  });
}
