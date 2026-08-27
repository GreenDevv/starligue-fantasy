export const dynamic = "force-dynamic";

// GET /api/admin/friendly-matches — liste TOUS les matchs FriendlyMatch (Warm Up,
// Coupe de France, EHF CL/EL — ARCHITECTURE.md §19/§19.2/§19.6) de la saison
// active : à la fois pour rentrer le score à la main quand lnh.fr traîne à le
// publier (aucune stat joueur n'existe de toute façon pour ces compétitions, cf.
// §19 "Pas de stats joueurs pour les Warm Up" — un score suffit, pas de boxscore),
// et pour gérer les matchs eux-mêmes (corriger une date erronée, supprimer un
// doublon) — plus limité au coup d'envoi déjà passé depuis §19.6, sinon
// impossible de retrouver un match mal daté dans le futur pour le corriger.
// `needsResult` reste calculé pour que le client puisse filtrer par défaut sur
// les matchs "à traiter" sans redemander la liste complète.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON" } }, { status: 400 });
  }

  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId: season.id },
    orderBy: { kickoffAt: "desc" },
    take: 300,
    select: {
      id: true,
      competitionLabel: true,
      kickoffAt: true,
      status: true,
      homeClubName: true,
      awayClubName: true,
      homeScore: true,
      awayScore: true,
      source: true,
    },
  });

  return NextResponse.json({
    data: {
      matches: matches.map((m) => ({
        ...m,
        // À rentrer à la main : coup d'envoi passé, pas encore de score, et pas
        // explicitement annulé (un CANCELLED n'a légitimement pas de score).
        needsResult: m.status !== "CANCELLED" && m.kickoffAt <= new Date() && (m.homeScore === null || m.awayScore === null),
      })),
    },
  });
}
