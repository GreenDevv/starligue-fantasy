export const dynamic = "force-dynamic";

// POST /api/cron/post-stat-leaders — ARCHITECTURE.md §6.7
// Publie automatiquement 3 carrousels Instagram "Leaders Starligue" (attaque /
// gardiens / défense) pour chaque journée notée (Gameweek.isScored) de la saison
// active pas encore postée. Idempotence par post (pas par journée) via
// SocialPost.dedupeKey, vérifiée AVANT tout appel Graph API — Instagram ne permet pas
// de supprimer un média publié (cf. [[instagram_publishing]]), donc un doublon serait
// irréversible.
//
// ?dryRun=true (utilisable via une session admin, verifyCronAuth accepte les deux)
// construit les URLs d'image + légendes sans rien publier ni marquer en base — sert à
// visualiser les slides avant d'activer le vrai cron Railway.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import {
  postCarousel,
  getInstagramCredentialsFromEnv,
  getMediaPermalink,
  InstagramApiError,
} from "@/lib/instagram/client";
import { buildStatLeadersCaption, type StatLeadersPostKind } from "@/lib/instagram/stat-leaders-caption";

const POST_DEFINITIONS: { kind: StatLeadersPostKind; statKeys: string[] }[] = [
  { kind: "attack", statKeys: ["goalsPlay", "goalsTotal", "goalsPenalty", "assists"] },
  { kind: "goalkeepers", statKeys: ["saves"] },
  { kind: "defense", statKeys: ["ballsRecovered", "opponentShotsBlocked", "neutralizations"] },
];
const SCOPES = ["season", "average"] as const;

function buildImageUrls(
  baseUrl: string,
  seasonId: string,
  gameweekNumber: number,
  statKeys: string[]
): string[] {
  const urls: string[] = [];
  for (const statKey of statKeys) {
    for (const scope of SCOPES) {
      const url = new URL("/api/og/stat-leaders", baseUrl);
      url.searchParams.set("statKey", statKey);
      url.searchParams.set("scope", scope);
      url.searchParams.set("seasonId", seasonId);
      url.searchParams.set("gameweekNumber", String(gameweekNumber));
      urls.push(url.toString());
    }
  }
  return urls;
}

interface JobResult {
  gameweekNumber: number;
  kind: StatLeadersPostKind;
  skipped?: boolean;
  dryRun?: boolean;
  success?: boolean;
  reason?: string;
  imageUrls?: string[];
  caption?: string;
  mediaId?: string;
  permalink?: string | null;
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!dryRun) {
    try {
      getInstagramCredentialsFromEnv();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "CONFIG_MISSING",
            message: "Identifiants Instagram non configurés (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID)",
          },
        },
        { status: 500 }
      );
    }
  }

  // Journées notées de la saison active — même filtre que /api/cron/compute-scores
  // pour ignorer le Mode Simulation (jamais de post Instagram depuis une saison passée
  // rejouée en admin).
  const candidates = await prisma.gameweek.findMany({
    where: { isScored: true, season: { isActive: true } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, seasonId: true },
  });

  const results: JobResult[] = [];

  for (const gameweek of candidates) {
    for (const post of POST_DEFINITIONS) {
      const dedupeKey = `stat-leaders:${post.kind}:${gameweek.id}`;

      const already = await prisma.socialPost.findUnique({ where: { dedupeKey } });
      if (already) {
        results.push({ gameweekNumber: gameweek.number, kind: post.kind, skipped: true, reason: "déjà publié" });
        continue;
      }

      const imageUrls = buildImageUrls(baseUrl, gameweek.seasonId, gameweek.number, post.statKeys);
      const caption = buildStatLeadersCaption(post.kind, gameweek.number);

      if (dryRun) {
        results.push({ gameweekNumber: gameweek.number, kind: post.kind, dryRun: true, imageUrls, caption });
        continue;
      }

      try {
        const creds = getInstagramCredentialsFromEnv();
        const { mediaId } = await postCarousel({ imageUrls, caption }, creds);
        const permalink = await getMediaPermalink(mediaId, creds);
        await prisma.socialPost.create({ data: { dedupeKey, gameweekId: gameweek.id, mediaId, permalink } });
        results.push({ gameweekNumber: gameweek.number, kind: post.kind, success: true, mediaId, permalink });
      } catch (e) {
        results.push({
          gameweekNumber: gameweek.number,
          kind: post.kind,
          success: false,
          reason: e instanceof InstagramApiError ? e.message : e instanceof Error ? e.message : "erreur inconnue",
        });
      }
    }
  }

  return NextResponse.json({ data: results });
}
