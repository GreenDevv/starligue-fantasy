// GET /api/og/gameweek-recap?mode=live|simulation&teamId=&gameweekId=
// Visuel partageable (1080×1350 PNG) du récap de journée — rendu par
// renderGameweekRecapImage (src/lib/social/gameweek-recap-image.tsx).
//
// Runtime Node.js (défaut Route Handler) : Prisma (getGameweekLineupDetail /
// getRankMovement) + lecture polices/logos disque. Vérifie que l'équipe appartient
// bien à l'utilisateur connecté.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGameweekLineupDetail, pickTopPerformer } from "@/lib/team/gameweek-lineup-detail";
import { getRankMovement } from "@/lib/standings/get-rank-movement";
import {
  renderGameweekRecapImage,
  type GameweekRecapImageData,
  type RecapImagePlayer,
} from "@/lib/social/gameweek-recap-image";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  mode: z.enum(["live", "simulation"]),
  teamId: z.string().cuid(),
  gameweekId: z.string().min(1),
});

const FONTS_DIR = path.join(process.cwd(), "src/lib/social/fonts");
let fontCache: { display: Buffer; sans: Buffer } | null = null;
async function loadFonts() {
  if (!fontCache) {
    const [display, sans] = await Promise.all([
      readFile(path.join(FONTS_DIR, "BarlowCondensed-Bold.ttf")),
      readFile(path.join(FONTS_DIR, "Inter-Regular.ttf")),
    ]);
    fontCache = { display, sans };
  }
  return fontCache;
}

const logoCache = new Map<string, string>();
async function localImageDataUri(publicPath: string): Promise<string | null> {
  if (logoCache.has(publicPath)) return logoCache.get(publicPath)!;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", publicPath));
    const uri = `data:image/png;base64,${buf.toString("base64")}`;
    logoCache.set(publicPath, uri);
    return uri;
  } catch {
    return null;
  }
}

const jsonError = (code: string, status: number) =>
  new Response(JSON.stringify({ error: { code } }), { status, headers: { "content-type": "application/json" } });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("UNAUTHORIZED", 401);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonError("INVALID_QUERY", 400);
  const { mode, teamId, gameweekId } = parsed.data;

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: teamId },
          select: { userId: true, name: true, seasonId: true, league: { select: { name: true } } },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: teamId },
          select: { userId: true, name: true, league: { select: { name: true, seasonId: true } } },
        });

  if (!team || team.userId !== session.user.id) return jsonError("FORBIDDEN", 403);

  const seasonId =
    mode === "simulation"
      ? (team as { seasonId: string }).seasonId
      : (team.league as { seasonId: string }).seasonId;

  const [detail, fonts] = await Promise.all([getGameweekLineupDetail(mode, teamId, gameweekId), loadFonts()]);
  if (!detail) return jsonError("NOT_FOUND", 404);

  const rank = await getRankMovement(
    seasonId,
    mode === "simulation" ? "SIMULATION" : "LIVE",
    teamId,
    detail.gameweekNumber
  );
  const top = pickTopPerformer(detail);
  const topLogo = top?.club.logoUrl ? await localImageDataUri(top.club.logoUrl) : null;

  const toImagePlayer = (p: (typeof detail.players)[number]): RecapImagePlayer => ({
    playerId: p.playerId,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    isCaptain: p.isCaptain,
    points: p.points,
  });

  const data: GameweekRecapImageData = {
    gameweekNumber: detail.gameweekNumber,
    teamName: team.name,
    leagueName: team.league.name,
    totalPoints: detail.totalPoints ?? 0,
    rank: rank
      ? {
          globalRank: rank.globalRank,
          leagueRank: rank.leagueRank,
          globalDelta: rank.globalDelta,
          leagueDelta: rank.leagueDelta,
          totalTeams: rank.totalTeams,
        }
      : null,
    topPerformer: top
      ? {
          firstName: top.firstName,
          lastName: top.lastName,
          position: top.position,
          clubShortName: top.club.shortName,
          clubLogoDataUri: topLogo,
          photoUrl: top.photoUrl,
          points: top.points,
        }
      : null,
    starters: detail.players.filter((p) => p.role === "STARTER").map(toImagePlayer),
    bench: detail.players.filter((p) => p.role === "BENCH").map(toImagePlayer),
  };

  return renderGameweekRecapImage(data, fonts);
}
