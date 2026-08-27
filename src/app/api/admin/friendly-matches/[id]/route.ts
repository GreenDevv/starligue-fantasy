export const dynamic = "force-dynamic";

// PATCH  /api/admin/friendly-matches/[id] — rentre un résultat à la main (score +
// statut final) et/ou corrige le coup d'envoi pour un match FriendlyMatch (Warm
// Up/Coupe de France/EHF) que lnh.fr n'a pas encore publié ou publie avec une
// date erronée — ARCHITECTURE.md §19.6. Marque source: MANUAL, protégé du
// prochain re-scrape par syncFriendlyMatches (src/lib/ingestion/warmup.ts)
// jusqu'à ce que lnh.fr publie lui-même un résultat définitif (kickoffAt inclus
// depuis le fix du 2026-08-27 — avant ça, une correction de date se faisait
// écraser par le cron du lendemain). status accepte seulement FINISHED/POSTPONED
// — pas CANCELLED : un match annulé passe par le DELETE ?hard=1 ci-dessous (le
// garder en base avec un statut ne le retire d'aucun affichage, cf. §19.6).
// DELETE /api/admin/friendly-matches/[id] — annule la saisie manuelle, remet le
// match en attente (source repasse au scraper d'origine, déduit du préfixe de
// dedupeKey — "lnh:"/"ehf:"). Avec ?hard=1, supprime définitivement la ligne —
// pour un match annulé, ou un doublon (lnh.fr republie parfois un match sous un
// nouveau calendars_id sans retirer l'ancien, laissant une ligne SCHEDULED
// orpheline qui ne recevra jamais de score) plutôt qu'un vrai match à corriger.
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

const ROW_SELECT = {
  id: true,
  competitionLabel: true,
  kickoffAt: true,
  status: true,
  homeClubName: true,
  awayClubName: true,
  homeScore: true,
  awayScore: true,
  source: true,
} as const;

function toRow(match: {
  id: string;
  competitionLabel: string;
  kickoffAt: Date;
  status: string;
  homeClubName: string;
  awayClubName: string;
  homeScore: number | null;
  awayScore: number | null;
  source: string;
}) {
  return {
    ...match,
    needsResult: match.status !== "CANCELLED" && (match.homeScore === null || match.awayScore === null),
  };
}

const PatchSchema = z
  .object({
    // Coup d'envoi corrigé (lnh.fr publie parfois une date erronée) — indépendant
    // du résultat, peut être envoyé seul.
    kickoffAt: z.string().datetime(),
    status: z.enum(["FINISHED", "POSTPONED"]),
    homeScore: z.number().int().min(0).max(99).nullable().optional(),
    awayScore: z.number().int().min(0).max(99).nullable().optional(),
  })
  .partial()
  .refine((data) => data.kickoffAt !== undefined || data.status !== undefined, {
    message: "kickoffAt ou status requis",
  })
  .refine((data) => data.status !== "FINISHED" || (data.homeScore != null && data.awayScore != null), {
    message: "homeScore/awayScore requis pour un match FINISHED",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const existing = await prisma.friendlyMatch.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const { kickoffAt, status, homeScore, awayScore } = parsed.data;
  const match = await prisma.friendlyMatch.update({
    where: { id: params.id },
    data: {
      source: "MANUAL",
      ...(kickoffAt !== undefined ? { kickoffAt: new Date(kickoffAt) } : {}),
      ...(status !== undefined
        ? {
            status,
            // Un match POSTPONED n'a pas de score, même si un score avait été saisi
            // puis le statut changé d'avis par l'admin.
            homeScore: status === "FINISHED" ? homeScore! : null,
            awayScore: status === "FINISHED" ? awayScore! : null,
          }
        : {}),
    },
    select: ROW_SELECT,
  });

  return NextResponse.json({ data: toRow(match) });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const existing = await prisma.friendlyMatch.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const hard = new URL(req.url).searchParams.get("hard") === "1";
  if (hard) {
    await prisma.friendlyMatch.delete({ where: { id: params.id } });
    return NextResponse.json({ data: { id: params.id, deleted: true } });
  }

  const originalSource = existing.dedupeKey.startsWith("ehf:") ? "EHF_SCRAPER" : "LNH_SCRAPER";
  const match = await prisma.friendlyMatch.update({
    where: { id: params.id },
    data: { status: "SCHEDULED", homeScore: null, awayScore: null, source: originalSource },
    select: ROW_SELECT,
  });

  return NextResponse.json({ data: toRow(match) });
}
