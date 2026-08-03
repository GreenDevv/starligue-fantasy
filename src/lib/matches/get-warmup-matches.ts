// Résout les matchs hors championnat (Warm Up, Coupe de France, EHF Champions
// League, EHF European League — ARCHITECTURE.md §19) à afficher sur la page
// d'accueil, dans le même MatchesStrip que le championnat (src/components/
// dashboard/MatchesStrip.tsx) — une seule liste chronologique par compétition
// (mélange résultats déjà connus et matchs à venir, le score s'affiche par match
// selon qu'il est renseigné ou non), pas de séparation résultats/à venir comme pour
// le championnat : contrairement à une journée de championnat, il n'y a pas de
// notion de "dernière journée"/"prochaine journée" ici. Les quatre compétitions
// partagent la table FriendlyMatch (competitionLabel les distingue) — chaque
// fonction filtre donc explicitement sur son propre ensemble de libellés pour ne
// pas les mélanger à l'affichage (ex: le strip "Warm Up" de la home ne doit jamais
// afficher un match de Coupe de France/Champions League/European League, et
// réciproquement).
//
// getClubWarmupMatches/getClubCoupeDeFranceMatches/getClubChampionsLeagueMatches/
// getClubEuropeanLeagueMatches (perspective isHome/opponent, même forme que
// ClubPageMatch de src/lib/clubs/club-page-data.ts) servent à fusionner ces
// compétitions et le championnat dans un seul flux sur la page club
// (ClubMatchesPanel) — seuls les clubs Daikin StarLigue ont une page, pas besoin de
// filtrer les adversaires hors DB (D2/étrangers/clubs européens), ils n'apparaissent
// que comme adversaire dans la liste d'un club Starligue.
import { prisma } from "@/lib/db";
import { EHF_CHAMPIONS_LEAGUE_LABEL, EHF_EUROPEAN_LEAGUE_LABEL } from "@/lib/data-providers/ehf-scraper.provider";

const WARMUP_LABELS = ["Warm Up", "Trophée des Champions - WUP"];
const COUPE_DE_FRANCE_LABELS = ["Coupe de France"];
// Réutilise les constantes du provider (pas de libellé redupliqué en chaîne libre) :
// un éventuel changement de libellé stocké en DB doit casser la compilation ici
// plutôt que de faire silencieusement disparaître ces matchs de l'affichage.
const CHAMPIONS_LEAGUE_LABELS = [EHF_CHAMPIONS_LEAGUE_LABEL];
const EUROPEAN_LEAGUE_LABELS = [EHF_EUROPEAN_LEAGUE_LABEL];

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
  // Groupe de phase de groupes EHF ("A".."F") — null pour Warm Up/Coupe de France,
  // et pour un tour EHF hors phase de groupes (qualifs/knockout). Sert à construire
  // le lien vers /matches/ehf/[competition]/[group] depuis la home (ARCHITECTURE.md
  // §19), même info que ClubWarmupMatch.groupLabel ci-dessous.
  groupLabel: string | null;
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

async function getFriendlyMatches(seasonId: string, competitionLabels: string[]): Promise<WarmupMatchRow[]> {
  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId, competitionLabel: { in: competitionLabels } },
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
    groupLabel: m.groupLabel,
  }));
}

export function getWarmupMatches(seasonId: string): Promise<WarmupMatchRow[]> {
  return getFriendlyMatches(seasonId, WARMUP_LABELS);
}

export function getCoupeDeFranceMatches(seasonId: string): Promise<WarmupMatchRow[]> {
  return getFriendlyMatches(seasonId, COUPE_DE_FRANCE_LABELS);
}

export function getChampionsLeagueMatches(seasonId: string): Promise<WarmupMatchRow[]> {
  return getFriendlyMatches(seasonId, CHAMPIONS_LEAGUE_LABELS);
}

export function getEuropeanLeagueMatches(seasonId: string): Promise<WarmupMatchRow[]> {
  return getFriendlyMatches(seasonId, EUROPEAN_LEAGUE_LABELS);
}

export interface ClubWarmupMatch {
  id: string;
  isHome: boolean;
  opponent: WarmupMatchClub;
  ownScore: number | null;
  opponentScore: number | null;
  kickoffAt: Date;
  // Groupe de phase de groupes EHF ("A".."F") — toujours null pour Warm Up/Coupe
  // de France. Sert à construire le lien vers la page groupe (tous les matchs +
  // classement, demande explicite de l'utilisateur) dans ClubMatchesPanel.
  groupLabel: string | null;
}

async function getClubFriendlyMatches(
  clubId: string,
  seasonId: string,
  competitionLabels: string[]
): Promise<ClubWarmupMatch[]> {
  const matches = await prisma.friendlyMatch.findMany({
    where: { seasonId, competitionLabel: { in: competitionLabels }, OR: [{ homeClubId: clubId }, { awayClubId: clubId }] },
    include: {
      homeClub: { select: { shortName: true, name: true, logoUrl: true } },
      awayClub: { select: { shortName: true, name: true, logoUrl: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return matches.map((m) => {
    const isHome = m.homeClubId === clubId;
    return {
      id: m.id,
      isHome,
      opponent: isHome
        ? toDisplayClub(m.awayClub, m.awayClubName, m.awayClubLogoUrl, m.awayClubDivision)
        : toDisplayClub(m.homeClub, m.homeClubName, m.homeClubLogoUrl, m.homeClubDivision),
      ownScore: isHome ? m.homeScore : m.awayScore,
      opponentScore: isHome ? m.awayScore : m.homeScore,
      kickoffAt: m.kickoffAt,
      groupLabel: m.groupLabel,
    };
  });
}

export function getClubWarmupMatches(clubId: string, seasonId: string): Promise<ClubWarmupMatch[]> {
  return getClubFriendlyMatches(clubId, seasonId, WARMUP_LABELS);
}

export function getClubCoupeDeFranceMatches(clubId: string, seasonId: string): Promise<ClubWarmupMatch[]> {
  return getClubFriendlyMatches(clubId, seasonId, COUPE_DE_FRANCE_LABELS);
}

export function getClubChampionsLeagueMatches(clubId: string, seasonId: string): Promise<ClubWarmupMatch[]> {
  return getClubFriendlyMatches(clubId, seasonId, CHAMPIONS_LEAGUE_LABELS);
}

export function getClubEuropeanLeagueMatches(clubId: string, seasonId: string): Promise<ClubWarmupMatch[]> {
  return getClubFriendlyMatches(clubId, seasonId, EUROPEAN_LEAGUE_LABELS);
}
