// PUT /api/admin/clubs/[id] — modifie un club (nom, shortName, logoUrl, externalIds.lnh)

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

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortName: z.string().min(1).max(20).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")).optional(),
  lnhSlug: z.string().max(50).optional().or(z.literal("")).optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const club = await prisma.club.findUnique({ where: { id: params.id } });
  if (!club) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const { name, shortName, logoUrl, lnhSlug } = parsed.data;

  // Fusionne les externalIds existants avec la nouvelle valeur lnh
  const currentExtIds = (club.externalIds as Record<string, string>) ?? {};
  const newExtIds = lnhSlug !== undefined
    ? { ...currentExtIds, lnh: lnhSlug === "" ? undefined : lnhSlug }
    : currentExtIds;

  // Supprime les clés undefined
  const cleanExtIds = Object.fromEntries(
    Object.entries(newExtIds).filter(([, v]) => v !== undefined)
  );

  const updated = await prisma.club.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(shortName !== undefined ? { shortName } : {}),
      ...(logoUrl !== undefined ? { logoUrl: logoUrl === "" ? null : logoUrl } : {}),
      externalIds: cleanExtIds,
    },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      shortName: updated.shortName,
      logoUrl: updated.logoUrl,
      externalIds: updated.externalIds as Record<string, string>,
    },
  });
}
