export const dynamic = "force-dynamic";

// GET /api/admin/handball-clubs?filter=unverified|all — ARCHITECTURE.md §23.5.
// Modération des clubs d'origine saisis en clair par les membres (source = MANUAL,
// verified = false). L'admin les valide ou les fusionne avec un club de l'annuaire
// (PATCH /api/admin/handball-clubs/[id]).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const filter = new URL(request.url).searchParams.get("filter") ?? "unverified";

  const clubs = await prisma.handballClub.findMany({
    where: filter === "all" ? {} : { verified: false, source: "MANUAL" },
    orderBy: [{ verified: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      city: true,
      zipcode: true,
      country: true,
      source: true,
      verified: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json({
    data: {
      clubs: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        zipcode: c.zipcode,
        country: c.country,
        source: c.source,
        verified: c.verified,
        createdAt: c.createdAt.toISOString(),
        memberCount: c._count.members,
      })),
    },
  });
}
