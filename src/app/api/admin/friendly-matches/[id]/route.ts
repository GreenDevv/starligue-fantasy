export const dynamic = "force-dynamic";

// PATCH  /api/admin/friendly-matches/[id] — rentre un résultat à la main (score +
// statut final) pour un match FriendlyMatch (Warm Up/Coupe de France/EHF) que
// lnh.fr n'a pas encore publié — ARCHITECTURE.md §19. Marque source: MANUAL,
// protégé du prochain re-scrape par syncFriendlyMatches (src/lib/ingestion/
// warmup.ts) jusqu'à ce que lnh.fr publie lui-même un résultat définitif.
// DELETE /api/admin/friendly-matches/[id] — annule la saisie manuelle, remet le
// match en attente (source repasse au scraper d'origine, déduit du préfixe de
// dedupeKey — "lnh:"/"ehf:").
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

const SetResultSchema = z
  .object({
    status: z.enum(["FINISHED", "POSTPONED", "CANCELLED"]),
    homeScore: z.number().int().min(0).max(99).nullable().optional(),
    awayScore: z.number().int().min(0).max(99).nullable().optional(),
  })
  .refine((data) => data.status !== "FINISHED" || (data.homeScore != null && data.awayScore != null), {
    message: "homeScore/awayScore requis pour un match FINISHED",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SetResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const existing = await prisma.friendlyMatch.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const { status, homeScore, awayScore } = parsed.data;
  const match = await prisma.friendlyMatch.update({
    where: { id: params.id },
    data: {
      status,
      // Un match POSTPONED/CANCELLED n'a pas de score, même si un score avait
      // été saisi puis le statut changé d'avis par l'admin.
      homeScore: status === "FINISHED" ? homeScore! : null,
      awayScore: status === "FINISHED" ? awayScore! : null,
      source: "MANUAL",
    },
  });

  return NextResponse.json({
    data: {
      id: match.id,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      source: match.source,
      needsResult: false,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const existing = await prisma.friendlyMatch.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const originalSource = existing.dedupeKey.startsWith("ehf:") ? "EHF_SCRAPER" : "LNH_SCRAPER";
  const match = await prisma.friendlyMatch.update({
    where: { id: params.id },
    data: { status: "SCHEDULED", homeScore: null, awayScore: null, source: originalSource },
  });

  return NextResponse.json({
    data: {
      id: match.id,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      source: match.source,
      needsResult: true,
    },
  });
}
