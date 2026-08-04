// Données de la page club (src/app/(game)/clubs/[id]/page.tsx) : derniers résultats,
// prochains matchs (filtrables domicile/extérieur côté client) et série buts
// marqués/encaissés par journée pour le graphique.
//
// Piège anti-spoiler mode Simulation : contrairement au direct, `setup.ts` importe
// le calendrier RÉEL 2025/26 en entier dès la création — TOUS les matchs de la
// saison sont déjà en base avec status=FINISHED et le vrai score historique, y
// compris les journées pas encore "avancées" par l'admin (Season.
// currentSimulationGameweekNumber, cf. [[live_simulation_merge_plan]]). Il est donc
// FAUX de se fier à Match.status en mode simulation pour décider si un match est
// "joué" — seul le curseur admin fait foi (même piège que
// src/lib/matches/dashboard-strips.ts, qui l'évite déjà pour le widget dashboard).
// En direct, Match.status reflète l'état réel : aucun risque de spoiler par
// construction (les scores ne sont ingérés qu'après le coup de sifflet).
import { prisma } from "@/lib/db";
import type { SeasonMode } from "@/lib/team/active-team-context";

export interface ClubPageMatch {
  id: string;
  gameweekNumber: number;
  kickoffAt: Date;
  isHome: boolean;
  opponent: { id: string; shortName: string; name: string; logoUrl: string | null };
  ownScore: number | null;
  opponentScore: number | null;
}

export interface ClubPageData {
  results: ClubPageMatch[]; // les plus récents d'abord
  upcoming: ClubPageMatch[]; // les plus proches d'abord
  goalsChartEntries: {
    gameweekNumber: number;
    values: { goalsFor: number; goalsAgainst: number };
    opponent: { shortName: string; name: string; logoUrl: string | null };
  }[];
}

const CLUB_SELECT = { select: { id: true, shortName: true, name: true, logoUrl: true } } as const;

export async function getClubPageData(clubId: string, seasonId: string, mode: SeasonMode): Promise<ClubPageData> {
  let simulationCursor = 0;
  if (mode === "simulation") {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { currentSimulationGameweekNumber: true },
    });
    simulationCursor = season?.currentSimulationGameweekNumber ?? 0;
  }

  const matches = await prisma.match.findMany({
    where: { seasonId, OR: [{ homeClubId: clubId }, { awayClubId: clubId }] },
    include: {
      gameweek: { select: { number: true } },
      homeClub: CLUB_SELECT,
      awayClub: CLUB_SELECT,
    },
    orderBy: { kickoffAt: "asc" },
  });

  const results: ClubPageMatch[] = [];
  const upcoming: ClubPageMatch[] = [];
  const goalsChartEntries: ClubPageData["goalsChartEntries"] = [];

  for (const m of matches) {
    const isHome = m.homeClubId === clubId;
    const opponent = isHome ? m.awayClub : m.homeClub;
    const isDecided = mode === "simulation" ? m.gameweek.number <= simulationCursor : m.status === "FINISHED";
    const ownScore = isDecided ? (isHome ? m.homeScore : m.awayScore) : null;
    const opponentScore = isDecided ? (isHome ? m.awayScore : m.homeScore) : null;

    const row: ClubPageMatch = {
      id: m.id,
      gameweekNumber: m.gameweek.number,
      kickoffAt: m.kickoffAt,
      isHome,
      opponent,
      ownScore,
      opponentScore,
    };

    if (isDecided && ownScore !== null && opponentScore !== null) {
      results.push(row);
      goalsChartEntries.push({
        gameweekNumber: row.gameweekNumber,
        values: { goalsFor: ownScore, goalsAgainst: opponentScore },
        opponent,
      });
    } else {
      upcoming.push(row);
    }
  }

  results.reverse();

  return { results, upcoming, goalsChartEntries };
}

// Les 5 derniers matchs Starligue décidés, en ordre chronologique (le plus ancien
// à gauche, le plus récent à droite) — `results` (ci-dessus) est trié "plus
// récent d'abord". Complété par des `null` à gauche si moins de 5 matchs joués
// (début de saison). Fonction pure, réutilisée par la page club ET la page
// head-to-head (ClubFormBadge) : `results` applique déjà la règle anti-spoiler
// simulation (curseur admin, jamais Match.status directement, voir commentaire en
// tête de fichier), donc toute page qui l'utilise en hérite automatiquement.
export function getLastFiveForm(results: ClubPageMatch[]): (ClubPageMatch | null)[] {
  const chronological = results.slice(0, 5).reverse();
  return [...Array<null>(Math.max(0, 5 - chronological.length)).fill(null), ...chronological];
}

// Même calcul que getLastFiveForm ci-dessus, mais pour tous les clubs d'un coup (une
// seule requête sur tous les matchs de la saison) — utilisé par ClubSwitcher pour
// afficher la forme de chaque club dans le menu déroulant, pas seulement celui de la
// page courante. Hérite de la même règle anti-spoiler simulation (curseur admin, cf.
// commentaire en tête de fichier).
export async function getAllClubsLastFiveForm(
  seasonId: string,
  mode: SeasonMode,
  clubIds: string[]
): Promise<Record<string, (ClubPageMatch | null)[]>> {
  let simulationCursor = 0;
  if (mode === "simulation") {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { currentSimulationGameweekNumber: true },
    });
    simulationCursor = season?.currentSimulationGameweekNumber ?? 0;
  }

  const matches = await prisma.match.findMany({
    where: { seasonId },
    include: {
      gameweek: { select: { number: true } },
      homeClub: CLUB_SELECT,
      awayClub: CLUB_SELECT,
    },
    orderBy: { kickoffAt: "asc" },
  });

  const resultsByClub = new Map<string, ClubPageMatch[]>();
  function pushResult(clubId: string, row: ClubPageMatch) {
    const arr = resultsByClub.get(clubId);
    if (arr) arr.push(row);
    else resultsByClub.set(clubId, [row]);
  }

  for (const m of matches) {
    const isDecided = mode === "simulation" ? m.gameweek.number <= simulationCursor : m.status === "FINISHED";
    if (!isDecided || m.homeScore === null || m.awayScore === null) continue;

    const base = { id: m.id, gameweekNumber: m.gameweek.number, kickoffAt: m.kickoffAt };
    pushResult(m.homeClubId, {
      ...base,
      isHome: true,
      opponent: m.awayClub,
      ownScore: m.homeScore,
      opponentScore: m.awayScore,
    });
    pushResult(m.awayClubId, {
      ...base,
      isHome: false,
      opponent: m.homeClub,
      ownScore: m.awayScore,
      opponentScore: m.homeScore,
    });
  }

  return Object.fromEntries(
    clubIds.map((id) => {
      // resultsByClub est en ordre chronologique croissant (requête triée asc,
      // poussé dans cet ordre) ; getLastFiveForm attend l'ordre inverse (plus
      // récent d'abord), comme `results` dans getClubPageData ci-dessus.
      const mostRecentFirst = [...(resultsByClub.get(id) ?? [])].reverse();
      return [id, getLastFiveForm(mostRecentFirst)];
    })
  );
}
