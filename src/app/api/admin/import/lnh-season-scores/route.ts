// POST /api/admin/import/lnh-season-scores — scrape le classement "Score LNH" d'une
// saison lnh.fr passée (ex: 2025/2026) et l'enregistre dans PlayerLnhSeasonStat.
// Sert de base à une future estimation de valorisation ; les joueurs sans historique
// (nouveaux en Starligue) n'auront simplement aucune ligne — traité ailleurs.
//
// Un joueur déjà en Starligue l'an dernier mais transféré cette saison a son score
// scrapé sous son ANCIEN club : matchPlayerSeasonScores tente un second passage par
// nom seul dans ce cas (matchedByNameOnly=true, jamais de club deviné/corrigé).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { matchPlayerSeasonScores, type ScrapedScoreRow } from "@/lib/players/lnh-score-matching";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { seasonsId?: string; seasonLabel?: string };
  const lnhSeasonsId = body.seasonsId ?? "39"; // 2025/2026 par défaut
  const seasonLabel = body.seasonLabel ?? "2025/2026";

  const provider = createLnhScraperProvider();
  let scraped;
  try {
    scraped = await provider.fetchSeasonScores(lnhSeasonsId);
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: e.message } }, { status: 502 });
    }
    throw e;
  }

  if (scraped.length === 0) {
    return NextResponse.json(
      { error: { code: "NO_DATA", message: `Aucun score trouvé pour seasons_id=${lnhSeasonsId}` } },
      { status: 502 }
    );
  }

  // Club LNH slug → shortName (déjà correct depuis Phase 3.5, cf. Club.externalIds.lnh).
  // Si le slug ne résout à aucun club chez nous (ex: club relégué), on garde le slug brut
  // tel quel — ça ne matchera jamais en clé exacte mais laisse la chance au fallback nom seul.
  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const rows: ScrapedScoreRow[] = scraped.map((s) => ({
    firstName: s.firstName,
    lastName: s.lastName,
    clubShortName: clubShortNameBySlug.get(s.lnhClubSlug.toLowerCase()) ?? s.lnhClubSlug,
    matchesPlayed: s.matchesPlayed,
    totalScore: s.totalScore,
  }));

  const { matches, unmatched } = matchPlayerSeasonScores(
    rows,
    players.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, clubShortName: p.club.shortName })),
  );

  if (matches.length > 0) {
    await prisma.$transaction(
      matches.map((m) =>
        prisma.playerLnhSeasonStat.upsert({
          where: { playerId_seasonLabel: { playerId: m.playerId, seasonLabel } },
          create: {
            playerId: m.playerId,
            seasonLabel,
            lnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
          update: {
            lnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
        })
      )
    );
  }

  const transfersDetected = matches.filter((m) => m.matchedByNameOnly).length;

  return NextResponse.json({
    data: {
      seasonLabel,
      lnhSeasonsId,
      totalScraped: scraped.length,
      matched: matches.length,
      transfersDetected,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 30).map((u) => ({ ...u.row, reason: u.reason })),
    },
  });
}
