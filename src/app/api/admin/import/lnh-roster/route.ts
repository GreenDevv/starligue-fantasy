// POST /api/admin/import/lnh-roster
// Importe tous les joueurs depuis lnh.fr (saison 2025/2026 = seasons_id 39)
// et remplace les joueurs de la saison active.
//
// Score LNH non exposé par l'API LNH → market_value calculée par poste :
//   GK 9.0M | CB 8.5M | LB/RB 8.0M | LW/RW 7.5M | PV 7.5M
//
// Clubs LNH → mapping vers shortName DB + création si absent

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider, IngestionError } from "@/lib/data-providers/lnh-scraper.provider";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

// Valeur marchande de base par poste (GK en haut car score LNH naturellement plus élevé pour les gardiens)
const BASE_MV: Record<string, number> = {
  GK: 9.0,
  CB: 8.5,
  LB: 8.0,
  RB: 8.0,
  LW: 7.5,
  RW: 7.5,
  PV: 7.5,
};

// Mapping lnh.fr slug → DB shortName + nom complet
// Utilisé comme fallback si externalIds.lnh ne correspond pas
const LNH_SLUG_MAP: Record<string, { shortName: string; fullName: string }> = {
  "aix":           { shortName: "PAUC",    fullName: "Pays d'Aix Université Club HB" },
  "cesson-rennes": { shortName: "CRMHB",   fullName: "Cesson-Rennes Métropole HB" },
  "chambery":      { shortName: "CSMBH",   fullName: "Chambéry Savoie Mont Blanc HB" },
  "chartres":      { shortName: "CCMHB",   fullName: "C' Chartres Métropole HB" },
  "dijon":         { shortName: "GDH",     fullName: "Grand Dijon Handball" },
  "dunkerque":     { shortName: "USDK",    fullName: "USDK Dunkerque HGL" },
  "istres":        { shortName: "IPH",     fullName: "Istres Provence Handball" },
  "limoges":       { shortName: "LIMOGES", fullName: "Limoges Handball" },
  "montpellier":   { shortName: "MHB",     fullName: "Montpellier Handball" },
  "nantes":        { shortName: "HBCN",    fullName: "HBC Nantes" },
  "nimes":         { shortName: "USAM",    fullName: "USAM Nîmes Gard" },
  "paris":         { shortName: "PSG",     fullName: "Paris Saint-Germain Handball" },
  "saint-raphael": { shortName: "SRHB",    fullName: "Saint-Raphaël Var Handball" },
  "selestat":      { shortName: "SAH",     fullName: "Sélestat Alsace Handball" },
  "toulouse":      { shortName: "FENIX",   fullName: "Fenix Toulouse Handball" },
  "tremblay":      { shortName: "TFHB",    fullName: "Tremblay-en-France HB" },
};

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s]+/g, " ").trim();
}

// Arrondit à 0.5 le plus proche, capé entre 4.0 et 20.0
function roundMV(v: number): number {
  return Math.min(20.0, Math.max(4.0, Math.round(v * 2) / 2));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { seasonsId?: string; dryRun?: boolean };
  const lnhSeasonsId = body.seasonsId ?? "39"; // saison 2025/2026 par défaut
  const dryRun = body.dryRun === true;

  // --- 1. Scrape LNH ---
  const provider = createLnhScraperProvider();
  let scraped;
  try {
    scraped = await provider.fetchPlayers(lnhSeasonsId);
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json(
        { error: { code: "SCRAPER_ERROR", message: e.message } },
        { status: 502 }
      );
    }
    throw e;
  }

  if (scraped.length === 0) {
    return NextResponse.json(
      { error: { code: "NO_DATA", message: "Aucun joueur scrapé depuis lnh.fr" } },
      { status: 502 }
    );
  }

  // --- 2. Résolution / création des clubs ---
  const dbClubs = await prisma.club.findMany();

  // Map slug → clubId (depuis externalIds.lnh)
  const clubByLnhSlug = new Map<string, string>();
  const clubByShortName = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubByLnhSlug.set(extIds.lnh.toLowerCase(), c.id);
    clubByShortName.set(c.shortName.toLowerCase(), c.id);
  }

  // Résout ou crée le club pour un slug LNH
  async function resolveClub(slug: string): Promise<string | null> {
    // 1. Par externalIds.lnh exact
    if (clubByLnhSlug.has(slug)) return clubByLnhSlug.get(slug)!;

    // 2. Par mapping hardcodé → shortName
    const mapped = LNH_SLUG_MAP[slug];
    if (mapped && clubByShortName.has(mapped.shortName.toLowerCase())) {
      const id = clubByShortName.get(mapped.shortName.toLowerCase())!;
      // Met à jour le slug LNH pour les prochaines fois
      if (!dryRun) {
        await prisma.club.update({
          where: { id },
          data: { externalIds: { ...(dbClubs.find((c) => c.id === id)?.externalIds as object ?? {}), lnh: slug } },
        });
        clubByLnhSlug.set(slug, id);
      }
      return id;
    }

    // 3. Création du club (si absent)
    if (!mapped) return null;
    if (dryRun) return `DRY-${slug}`;

    const newClub = await prisma.club.create({
      data: {
        name: mapped.fullName,
        shortName: mapped.shortName,
        externalIds: { lnh: slug },
      },
    });
    clubByLnhSlug.set(slug, newClub.id);
    clubByShortName.set(mapped.shortName.toLowerCase(), newClub.id);
    return newClub.id;
  }

  // --- 3. Saison active ---
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  if (dryRun) {
    // Dry run : retourne uniquement les stats sans modifier la DB
    const slugCounts = scraped.reduce<Record<string, number>>((acc, p) => {
      acc[p.lnhClubSlug] = (acc[p.lnhClubSlug] ?? 0) + 1;
      return acc;
    }, {});
    const posCounts = scraped.reduce<Record<string, number>>((acc, p) => {
      acc[p.position] = (acc[p.position] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({
      data: {
        dryRun: true,
        totalScraped: scraped.length,
        byClub: slugCounts,
        byPosition: posCounts,
        sample: scraped.slice(0, 5).map((p) => ({
          name: `${p.firstName} ${p.lastName}`,
          position: p.position,
          club: p.lnhClubSlug,
          mv: BASE_MV[p.position] ?? 7.5,
        })),
      },
    });
  }

  // --- 4. Marque tous les joueurs existants comme inactifs ---
  await prisma.player.updateMany({
    where: { seasonId: season.id },
    data: { isActive: false },
  });

  // --- 5. Charge les joueurs existants pour upsert ---
  const existingPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: { id: true, firstName: true, lastName: true, clubId: true },
  });
  const playerByName = new Map<string, string>(); // normName → id
  for (const p of existingPlayers) {
    playerByName.set(`${normalizeName(p.lastName)}|${normalizeName(p.firstName)}`, p.id);
  }

  // --- 6. Upsert joueurs ---
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const clubsMissing = new Set<string>();

  // Groupe par poste pour calculer la variation de MV (top/mid/bottom)
  const byPosition = scraped.reduce<Record<string, typeof scraped>>((acc, p) => {
    if (!acc[p.position]) acc[p.position] = [];
    acc[p.position]!.push(p);
    return acc;
  }, {});

  // Assigne une MV basée sur la position dans le groupe (top = +1.0M, bottom = -1.0M)
  const mvMap = new Map<string, number>(); // profileUrl → market value
  for (const [pos, players] of Object.entries(byPosition)) {
    const base = BASE_MV[pos] ?? 7.5;
    const n = players.length;
    players.forEach((p, i) => {
      // Distribution linéaire : premier joueur +1.0M, dernier -1.0M
      const delta = n <= 1 ? 0 : (1.0 - (2.0 * i) / (n - 1));
      mvMap.set(p.profileUrl, roundMV(base + delta));
    });
  }

  for (const sp of scraped) {
    const clubId = await resolveClub(sp.lnhClubSlug);
    if (!clubId) {
      clubsMissing.add(sp.lnhClubSlug);
      errors.push(`Club introuvable : ${sp.lnhClubSlug} (${sp.lastName} ${sp.firstName})`);
      skipped++;
      continue;
    }

    const mv = mvMap.get(sp.profileUrl) ?? (BASE_MV[sp.position] ?? 7.5);
    const nameKey = `${normalizeName(sp.lastName)}|${normalizeName(sp.firstName)}`;
    const existingId = playerByName.get(nameKey);

    try {
      if (existingId) {
        await prisma.player.update({
          where: { id: existingId },
          data: {
            firstName: sp.firstName,
            lastName: sp.lastName,
            position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
            clubId,
            marketValue: mv,
            isActive: true,
          },
        });
        updated++;
      } else {
        const newPlayer = await prisma.player.create({
          data: {
            seasonId: season.id,
            clubId,
            firstName: sp.firstName,
            lastName: sp.lastName,
            position: sp.position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
            marketValue: mv,
            isActive: true,
          },
        });
        playerByName.set(nameKey, newPlayer.id);
        created++;
      }
    } catch (err) {
      errors.push(`Erreur ${sp.lastName} ${sp.firstName}: ${String(err).slice(0, 80)}`);
      skipped++;
    }
  }

  return NextResponse.json({
    data: {
      scraped: scraped.length,
      created,
      updated,
      skipped,
      clubsMissing: Array.from(clubsMissing),
      errors: errors.slice(0, 20),
      note: "Market values calculées par poste (Score LNH non exposé par l'API lnh.fr)",
    },
  });
}
