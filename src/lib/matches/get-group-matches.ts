// Résout tous les matchs d'un groupe de phase de groupes EHF (Champions League ou
// European League) — pas seulement ceux d'un club Starligue en particulier,
// contrairement à getClubChampionsLeagueMatches (src/lib/matches/
// get-warmup-matches.ts) : la page "groupe" (ARCHITECTURE.md §19) affiche les 4
// équipes et l'intégralité de leurs confrontations, y compris entre deux clubs
// hors DB (voir FriendlyMatch.groupLabel + filterToRelevantGroups,
// src/lib/data-providers/ehf-scraper.provider.ts, qui garde ces matchs-là en base
// précisément pour cette page).
import { prisma } from "@/lib/db";

export interface GroupTeam {
  clubId: string | null; // null si club hors DB (pas de page /clubs/[id])
  name: string;
  shortName: string;
  logoUrl: string | null;
}

export interface GroupMatchRow {
  id: string;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  home: GroupTeam;
  away: GroupTeam;
}

export async function getGroupMatches(
  seasonId: string,
  competitionLabel: string,
  groupLabel: string
): Promise<GroupMatchRow[]> {
  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId, competitionLabel, groupLabel },
    include: {
      homeClub: { select: { id: true, shortName: true, name: true, logoUrl: true } },
      awayClub: { select: { id: true, shortName: true, name: true, logoUrl: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return matches.map((m) => ({
    id: m.id,
    kickoffAt: m.kickoffAt,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    home: m.homeClub
      ? { clubId: m.homeClub.id, name: m.homeClub.name, shortName: m.homeClub.shortName, logoUrl: m.homeClub.logoUrl }
      : { clubId: null, name: m.homeClubName, shortName: m.homeClubName, logoUrl: m.homeClubLogoUrl },
    away: m.awayClub
      ? { clubId: m.awayClub.id, name: m.awayClub.name, shortName: m.awayClub.shortName, logoUrl: m.awayClub.logoUrl }
      : { clubId: null, name: m.awayClubName, shortName: m.awayClubName, logoUrl: m.awayClubLogoUrl },
  }));
}
