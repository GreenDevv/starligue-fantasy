export const dynamic = "force-dynamic";

// POST /api/admin/import/clubs — ARCHITECTURE.md §6.6
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CsvProvider } from "@/lib/data-providers/csv.provider";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { code: "NO_FILE", message: "Fichier manquant" } }, { status: 400 });
  }

  const text = await file.text();
  const result = CsvProvider.parseClubs(text);
  if (!result.ok) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Erreurs CSV", details: result.errors } }, { status: 422 });
  }

  let upserted = 0;
  for (const row of result.rows) {
    const existing = await prisma.club.findFirst({ where: { shortName: row.shortName } });
    const data = { name: row.name, shortName: row.shortName, logoUrl: row.logoUrl || null };
    if (existing) {
      await prisma.club.update({ where: { id: existing.id }, data });
    } else {
      await prisma.club.create({ data });
    }
    upserted++;
  }

  return NextResponse.json({ data: { upserted } });
}