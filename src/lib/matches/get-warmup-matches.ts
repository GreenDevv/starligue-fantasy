// Résout les matchs de préparation ("Warm Up", ARCHITECTURE.md §19) à afficher sur
// la page d'accueil, dans le même MatchesStrip que le championnat
// (src/components/dashboard/MatchesStrip.tsx) — une seule liste chronologique
// (mélange résultats déjà connus et matchs à venir, le score s'affiche par match
// selon qu'il est renseigné ou non), pas de séparation résultats/à venir comme pour
// le championnat : contrairement à une journée de championnat, il n'y a pas de
// notion de "dernière journée"/"prochaine journée" ici, juste un calendrier continu
// sur ~1 mois de pré-saison.
import { prisma } from "@/lib/db";

export interface WarmupMatchClub {
  shortName: string; // pour ClubLogo (tronqué à 3 lettres si pas de logo) — nom scrapé si club inconnu
  name: string;
  logoUrl: string | null;
  // Renseigné seulement pour un club hors DB dont on a une info de division (segment
  // d'URL lnh.fr type "Proligue", ou connaissance manuelle pour un club étranger,
  // cf. src/lib/clubs/warmup-foreign-divisions.ts) — jamais pour un club Daikin
  // StarLigue connu (notre propre DB fait autorité, pas un label lnh.fr).
  division: string | null;
}

export interface WarmupMatchRow {
  id: string;
  homeClub: WarmupMatchClub;
  awayClub: WarmupMatchClub;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: Date;
}

function toDisplayClub(
  known: { shortName: string; name: string; logoUrl: string | null } | null,
  fallbackName: string,
  logoUrl: string | null,
  division: string | null
): WarmupMatchClub {
  if (known) return { ...known, division: null };
  return { shortName: fallbackName, name: fallbackName, logoUrl, division };
}

export async function getWarmupMatches(seasonId: string): Promise<WarmupMatchRow[]> {
  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId },
    include: {
      homeClub: { select: { shortName: true, name: true, logoUrl: true } },
      awayClub: { select: { shortName: true, name: true, logoUrl: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return matches.map((m) => ({
    id: m.id,
    homeClub: toDisplayClub(m.homeClub, m.homeClubName, m.homeClubLogoUrl, m.homeClubDivision),
    awayClub: toDisplayClub(m.awayClub, m.awayClubName, m.awayClubLogoUrl, m.awayClubDivision),
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    kickoffAt: m.kickoffAt,
  }));
}
