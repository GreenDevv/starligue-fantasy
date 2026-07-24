// Résolution de "quelle équipe/ligue courante" — ARCHITECTURE.md §2.5/§6.3.
// Une équipe par (userId, leagueId) : ce helper centralise la priorité
// leagueId explicite > cookie activeLeagueId > 1ère ligue de l'utilisateur.
// Le cookie n'est jamais fait confiance aveuglément — l'appartenance réelle est
// revérifiée à chaque résolution via LeagueMember.
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const ACTIVE_LEAGUE_COOKIE = "activeLeagueId";

async function isMember(userId: string, leagueId: string, seasonId?: string): Promise<boolean> {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { leagueId: true, league: { select: { seasonId: true } } },
  });
  if (!member) return false;
  return seasonId === undefined || member.league.seasonId === seasonId;
}

// seasonId (optionnel) scope la résolution à une saison donnée — nécessaire depuis
// que la simulation a, elle aussi, des Leagues (voir plan de fusion live/simulation,
// étape 5) : sans ce filtre, un utilisateur membre à la fois d'une ligue live et
// d'une ligue de simulation pourrait se voir résoudre la mauvaise ligue selon
// l'ordre d'adhésion. Les appelants qui ne passent pas seasonId gardent l'ancien
// comportement (toutes ligues confondues).
export async function resolveActiveLeagueId(
  userId: string,
  explicitLeagueId?: string | null,
  seasonId?: string
): Promise<string | null> {
  if (explicitLeagueId && (await isMember(userId, explicitLeagueId, seasonId))) {
    return explicitLeagueId;
  }

  const cookieValue = cookies().get(ACTIVE_LEAGUE_COOKIE)?.value;
  if (cookieValue && (await isMember(userId, cookieValue, seasonId))) {
    return cookieValue;
  }

  const first = await prisma.leagueMember.findFirst({
    where: { userId, ...(seasonId !== undefined && { league: { seasonId } }) },
    orderBy: { joinedAt: "asc" },
    select: { leagueId: true },
  });
  return first?.leagueId ?? null;
}

export function setActiveLeagueCookie(response: NextResponse, leagueId: string) {
  response.cookies.set(ACTIVE_LEAGUE_COOKIE, leagueId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
