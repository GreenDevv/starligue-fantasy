export const dynamic = "force-dynamic";

// GET /api/admin/players — liste joueurs saison active (filtrable)
// POST /api/admin/players — crée un joueur

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const POSITIONS = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"] as const;

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const position = searchParams.get("position") ?? "";
  const clubId = searchParams.get("clubId") ?? "";

  const seasonId = searchParams.get("seasonId") ?? "";

  const season = seasonId
    ? await prisma.season.findUnique({ where: { id: seasonId } })
    : await prisma.season.findFirst({ where: { isActive: true } });

  if (!season) {
    return NextResponse.json({ data: { players: [], clubs: [], seasons: [] } });
  }

  const seasons = await prisma.season.findMany({
    orderBy: { label: "desc" },
    select: { id: true, label: true, isActive: true },
  });

  const [players, clubs] = await Promise.all([
    prisma.player.findMany({
      where: {
        seasonId: season.id,
        ...(position ? { position: position as typeof POSITIONS[number] } : {}),
        ...(clubId ? { clubId } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { club: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ club: { shortName: "asc" } }, { position: "asc" }, { lastName: "asc" }],
    }),
    prisma.club.findMany({ orderBy: { shortName: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);

  return NextResponse.json({
    data: {
      players: players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        marketValue: Number(p.marketValue),
        valuationPending: p.valuationPending,
        photoUrl: p.photoUrl,
        isActive: p.isActive,
        injuredAt: p.injuredAt,
        club: p.club,
      })),
      clubs,
      seasons,
      currentSeasonId: season.id,
    },
  });
}

const CreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  position: z.enum(POSITIONS),
  clubId: z.string().min(1),
  marketValue: z.coerce.number().min(0.5).max(99.9),
  photoUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const { firstName, lastName, position, clubId, marketValue, photoUrl, isActive } = parsed.data;

  const player = await prisma.player.create({
    data: {
      seasonId: season.id,
      clubId,
      firstName,
      lastName,
      position,
      marketValue,
      photoUrl: photoUrl || null,
      isActive,
    },
    include: { club: { select: { id: true, name: true, shortName: true } } },
  });

  return NextResponse.json({
    data: {
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      marketValue: Number(player.marketValue),
      photoUrl: player.photoUrl,
      isActive: player.isActive,
      club: player.club,
    },
  });
}