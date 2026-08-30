// Classement des clubs d'origine par points fantasy — widget dashboard
// « Classement des clubs » (src/components/dashboard/widgets/ClubFantasyRankingWidget.tsx).
// Chaque manager qui a déclaré un club vérifié apporte à ce club le meilleur
// total de ses effectifs validés (0 s'il n'en a pas encore) ; le score du club
// est la somme de ces contributions. Comptes agrégés uniquement, jamais nominatif.
import { prisma } from "@/lib/db";
import type { SeasonMode } from "@/lib/team/active-team-context";

export interface ClubFantasyManagerRow {
  clubId: string;
  clubName: string;
  clubCity: string | null;
  clubCountry: string;
  points: number; // meilleur total validé du manager, 0 si aucun effectif
}

export interface ClubFantasyRankingRow {
  rank: number;
  clubId: string;
  clubName: string;
  clubCity: string | null;
  clubCountry: string;
  managers: number;
  points: number;
}

/** Somme par club + tri (points desc, puis nb de managers desc, puis nom). Pur. */
export function aggregateClubFantasyRanking(rows: ClubFantasyManagerRow[]): ClubFantasyRankingRow[] {
  const byClub = new Map<
    string,
    { name: string; city: string | null; country: string; managers: number; points: number }
  >();

  for (const r of rows) {
    const cur =
      byClub.get(r.clubId) ??
      { name: r.clubName, city: r.clubCity, country: r.clubCountry, managers: 0, points: 0 };
    cur.managers += 1;
    cur.points += r.points;
    byClub.set(r.clubId, cur);
  }

  return [...byClub.entries()]
    .map(([clubId, v]) => ({
      clubId,
      clubName: v.name,
      clubCity: v.city,
      clubCountry: v.country,
      managers: v.managers,
      points: v.points,
    }))
    .sort((a, b) => b.points - a.points || b.managers - a.managers || a.clubName.localeCompare(b.clubName))
    .map((r, i) => ({ rank: i + 1, ...r }));
}

export async function getClubFantasyRanking({
  seasonId,
  mode,
}: {
  seasonId: string;
  mode: SeasonMode;
}): Promise<ClubFantasyRankingRow[]> {
  // Un manager = son meilleur total d'effectif validé de la saison courante
  // (0 s'il n'en a aucun). Deux requêtes distinctes selon le mode plutôt qu'un
  // select conditionnel, pour garder un typage propre.
  const managers = await prisma.user.findMany({
    where: { homeClub: { is: { verified: true } } },
    select: {
      homeClub: { select: { id: true, name: true, city: true, country: true } },
      fantasyTeams:
        mode === "simulation"
          ? false
          : { where: { isValidated: true, league: { is: { seasonId } } }, select: { totalPoints: true } },
      simulationTeams:
        mode === "simulation"
          ? { where: { isValidated: true, seasonId }, select: { totalPoints: true } }
          : false,
    },
  });

  const rows: ClubFantasyManagerRow[] = [];
  for (const m of managers) {
    if (!m.homeClub) continue;
    const teams = mode === "simulation" ? m.simulationTeams : m.fantasyTeams;
    const best = (teams ?? []).reduce((max: number, t: { totalPoints: unknown }) => Math.max(max, Number(t.totalPoints)), 0);
    rows.push({
      clubId: m.homeClub.id,
      clubName: m.homeClub.name,
      clubCity: m.homeClub.city,
      clubCountry: m.homeClub.country,
      points: best,
    });
  }

  return aggregateClubFantasyRanking(rows);
}
