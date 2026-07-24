export const dynamic = "force-dynamic";

// POST /api/cron/sync-players?season=YYYY
// Importe les joueurs depuis API-Sports et met à jour les noms/prénoms en base.
// Ne crée pas de nouveaux clubs — les clubs doivent exister.
// Idempotent : upsert par (seasonId, clubId, firstName, lastName).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";

const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  photo: z.string().nullable().optional(),
});

const TeamPlayersSchema = z.object({
  team: z.object({ id: z.number(), name: z.string() }),
  players: z.array(PlayerSchema),
});

function mapPosition(pos: string | null | undefined): string | null {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper") || p.includes("gardien")) return "GK";
  if (p.includes("left wing") || p.includes("ailier gauche")) return "LW";
  if (p.includes("right wing") || p.includes("ailier droit")) return "RW";
  if (p.includes("left back") || p.includes("arrière gauche")) return "LB";
  if (p.includes("right back") || p.includes("arrière droit")) return "RB";
  if (p.includes("centre back") || p.includes("playmaker") || p.includes("demi")) return "CB";
  if (p.includes("pivot") || p.includes("line")) return "PV";
  return null;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return { firstName: "", lastName: fullName };
  const firstName = parts[0]!;
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: { code: "NO_KEY", message: "API_SPORTS_KEY manquant" } }, { status: 503 });
  }

  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");

  const season = seasonParam
    ? await prisma.season.findFirst({ where: { label: { contains: seasonParam } } })
    : await prisma.season.findFirst({ where: { isActive: true } });

  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Saison introuvable" } }, { status: 400 });
  }

  const leagueIdConfig = await prisma.gameConfig.findUnique({ where: { key: "API_SPORTS_LEAGUE_ID" } });
  const leagueId = leagueIdConfig?.value ?? "34";
  const apiSportsSeason = seasonParam ?? season.label.split("-")[0]!;

  // Fetch players par équipe
  const apiUrl = `https://v1.handball.api-sports.io/players?league=${leagueId}&season=${apiSportsSeason}`;
  const res = await fetch(apiUrl, {
    headers: { "x-apisports-key": apiKey, "Accept": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: { code: "API_ERROR", message: `HTTP ${res.status}` } }, { status: 502 });
  }

  const raw = await res.json() as { response?: unknown[]; errors?: unknown };

  if (!Array.isArray(raw.response)) {
    return NextResponse.json({
      error: { code: "API_ERROR", message: "Réponse inattendue", raw: raw.errors },
    }, { status: 502 });
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of raw.response) {
    const parsed = TeamPlayersSchema.safeParse(item);
    if (!parsed.success) { skipped++; continue; }

    const { team, players } = parsed.data;

    // Trouver le club par externalId api_sports ou par nom
    const club = await prisma.club.findFirst({
      where: {
        OR: [
          { externalIds: { path: ["api_sports"], equals: String(team.id) } },
          { name: { contains: team.name.split(" ")[0]!, mode: "insensitive" } },
        ],
      },
    });

    if (!club) {
      errors.push(`Club non trouvé : ${team.name} (id=${team.id})`);
      skipped += players.length;
      continue;
    }

    // Mettre à jour l'externalId du club
    const existingIds = (club.externalIds as Record<string, string>) ?? {};
    if (!existingIds.api_sports) {
      await prisma.club.update({
        where: { id: club.id },
        data: { externalIds: { ...existingIds, api_sports: String(team.id) } },
      });
    }

    for (const p of players) {
      const { firstName, lastName } =
        p.firstname && p.lastname
          ? { firstName: p.firstname, lastName: p.lastname }
          : splitName(p.name);

      if (!lastName) { skipped++; continue; }

      const position = mapPosition(p.position);
      if (!position) { skipped++; continue; }

      try {
        // Cherche un joueur placeholder du même poste dans ce club+saison
        const existing = await prisma.player.findFirst({
          where: {
            seasonId: season.id,
            clubId: club.id,
            externalIds: { path: ["api_sports"], equals: String(p.id) },
          },
        });

        if (existing) {
          await prisma.player.update({
            where: { id: existing.id },
            data: {
              firstName,
              lastName,
              photoUrl: p.photo ?? undefined,
              externalIds: { ...(existing.externalIds as object), api_sports: String(p.id) },
            },
          });
          updated++;
        } else {
          // Cherche un placeholder du même poste à remplacer
          const placeholder = await prisma.player.findFirst({
            where: {
              seasonId: season.id,
              clubId: club.id,
              position: position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
              firstName: { startsWith: club.shortName },
            },
            orderBy: { firstName: "asc" },
          });

          if (placeholder) {
            await prisma.player.update({
              where: { id: placeholder.id },
              data: {
                firstName,
                lastName,
                photoUrl: p.photo ?? undefined,
                externalIds: { api_sports: String(p.id) },
              },
            });
            updated++;
          } else {
            // Crée un nouveau joueur
            await prisma.player.create({
              data: {
                seasonId: season.id,
                clubId: club.id,
                firstName,
                lastName,
                position: position as "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV",
                marketValue: 5.0,
                externalIds: { api_sports: String(p.id) },
                isActive: true,
              },
            });
            created++;
          }
        }
      } catch (err) {
        errors.push(`${firstName} ${lastName} (${club.shortName}): ${String(err)}`);
        skipped++;
      }
    }
  }

  return NextResponse.json({
    data: { season: season.label, updated, created, skipped, errors: errors.slice(0, 20) },
  });
}