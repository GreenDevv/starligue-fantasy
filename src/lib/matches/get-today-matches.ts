// Matchs du jour calendaire, toutes compétitions confondues (championnat Daikin
// StarLigue + Warm Up + Coupe de France + Champions League + European League) —
// pour le carrousel "Jour de match" en haut à droite du hero de la home (demande
// explicite de l'utilisateur, 2026-08-06). Contrairement à
// get-warmup-matches.ts (chronologie complète par compétition, sans filtre de
// date), ce module ne renvoie que ce qui tombe aujourd'hui, mélangé en une seule
// liste triée par heure de coup d'envoi.
//
// "Aujourd'hui" = jour calendaire du serveur (même convention que
// src/lib/news/sync.ts::todayStart, pas de lib timezone dédiée) — aucun souci
// anti-spoiler ici : cette fonction n'est appelée que depuis la home publique,
// toujours en saison "isActive" (jamais la saison simulation, voir le
// commentaire de season dans page.tsx).
import { prisma } from "@/lib/db";
import {
  WARMUP_LABELS,
  COUPE_DE_FRANCE_LABELS,
  CHAMPIONS_LEAGUE_LABELS,
  EUROPEAN_LEAGUE_LABELS,
  toDisplayClub,
  type WarmupMatchClub,
} from "./get-warmup-matches";
import { ehfCompetitionSlug } from "./ehf-competition-slugs";

export type TodayCompetitionKey = "championship" | "warmup" | "coupeDeFrance" | "championsLeague" | "europeanLeague";

export interface TodayMatchRow {
  id: string;
  competitionKey: TodayCompetitionKey;
  homeClub: WarmupMatchClub;
  awayClub: WarmupMatchClub;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: Date;
  href?: string;
}

function todayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function getFriendlyToday(
  seasonId: string,
  competitionLabels: string[],
  competitionKey: TodayCompetitionKey,
  range: { start: Date; end: Date }
): Promise<TodayMatchRow[]> {
  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId, competitionLabel: { in: competitionLabels }, kickoffAt: { gte: range.start, lt: range.end } },
    include: {
      homeClub: { select: { shortName: true, name: true, logoUrl: true } },
      awayClub: { select: { shortName: true, name: true, logoUrl: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return matches.map((m) => ({
    id: m.id,
    competitionKey,
    homeClub: toDisplayClub(m.homeClub, m.homeClubName, m.homeClubLogoUrl, m.homeClubDivision),
    awayClub: toDisplayClub(m.awayClub, m.awayClubName, m.awayClubLogoUrl, m.awayClubDivision),
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    kickoffAt: m.kickoffAt,
    href:
      competitionKey === "championsLeague" || competitionKey === "europeanLeague"
        ? m.groupLabel
          ? `/matches/ehf/${ehfCompetitionSlug(competitionKey)}/${m.groupLabel}`
          : undefined
        : undefined,
  }));
}

export async function getTodayMatches(seasonId: string): Promise<TodayMatchRow[]> {
  const range = todayRange();

  const [championship, warmup, coupeDeFrance, championsLeague, europeanLeague] = await Promise.all([
    prisma.match.findMany({
      where: { seasonId, kickoffAt: { gte: range.start, lt: range.end } },
      include: {
        homeClub: { select: { shortName: true, name: true, logoUrl: true } },
        awayClub: { select: { shortName: true, name: true, logoUrl: true } },
      },
      orderBy: { kickoffAt: "asc" },
    }),
    getFriendlyToday(seasonId, WARMUP_LABELS, "warmup", range),
    getFriendlyToday(seasonId, COUPE_DE_FRANCE_LABELS, "coupeDeFrance", range),
    getFriendlyToday(seasonId, CHAMPIONS_LEAGUE_LABELS, "championsLeague", range),
    getFriendlyToday(seasonId, EUROPEAN_LEAGUE_LABELS, "europeanLeague", range),
  ]);

  const championshipRows: TodayMatchRow[] = championship.map((m) => ({
    id: m.id,
    competitionKey: "championship",
    homeClub: { ...m.homeClub, division: null },
    awayClub: { ...m.awayClub, division: null },
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    kickoffAt: m.kickoffAt,
    href: `/matches/${m.id}`,
  }));

  return [...championshipRows, ...warmup, ...coupeDeFrance, ...championsLeague, ...europeanLeague].sort(
    (a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()
  );
}
