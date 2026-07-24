import { describe, it, expect } from "vitest";
import { buildPlayerStatsChartEntries } from "./player-stats-chart";

const CLUB_A = { shortName: "USDK", name: "Dunkerque", logoUrl: null };
const CLUB_B = { shortName: "PSG", name: "Paris SG", logoUrl: "https://example.com/psg.png" };

function makeStat(overrides: {
  gameweekNumber: number;
  homeClubId: string;
  awayClubId: string;
  homeClub?: typeof CLUB_A;
  awayClub?: typeof CLUB_B;
  goalsTotal?: number;
  assists?: number;
}) {
  return {
    goalsTotal: overrides.goalsTotal ?? 0,
    assists: overrides.assists ?? 0,
    match: {
      homeClubId: overrides.homeClubId,
      awayClubId: overrides.awayClubId,
      gameweek: { number: overrides.gameweekNumber },
      homeClub: overrides.homeClub ?? CLUB_A,
      awayClub: overrides.awayClub ?? CLUB_B,
    },
  };
}

describe("buildPlayerStatsChartEntries", () => {
  it("trie par journée croissante quelle que soit l'ordre d'entrée", () => {
    const stats = [
      makeStat({ gameweekNumber: 3, homeClubId: "clubA", awayClubId: "clubB" }),
      makeStat({ gameweekNumber: 1, homeClubId: "clubA", awayClubId: "clubB" }),
      makeStat({ gameweekNumber: 2, homeClubId: "clubA", awayClubId: "clubB" }),
    ];
    const entries = buildPlayerStatsChartEntries(stats, "clubA");
    expect(entries.map((e) => e.gameweekNumber)).toEqual([1, 2, 3]);
  });

  it("choisit le club adverse selon domicile/extérieur du joueur", () => {
    const stats = [
      // le joueur est à domicile (clubA) → adversaire = équipe away (CLUB_B)
      makeStat({ gameweekNumber: 1, homeClubId: "clubA", awayClubId: "clubB" }),
      // le joueur est à l'extérieur (clubA est away) → adversaire = équipe home (CLUB_A)
      makeStat({ gameweekNumber: 2, homeClubId: "clubB", awayClubId: "clubA", homeClub: CLUB_A, awayClub: CLUB_B }),
    ];
    const entries = buildPlayerStatsChartEntries(stats, "clubA");
    expect(entries[0]!.opponent?.shortName).toBe("PSG");
    expect(entries[1]!.opponent?.shortName).toBe("USDK");
  });

  it("valeur par défaut 0 pour les stats absentes/null", () => {
    const stats = [makeStat({ gameweekNumber: 1, homeClubId: "clubA", awayClubId: "clubB", goalsTotal: undefined })];
    // @ts-expect-error — simule une valeur null renvoyée par Prisma
    stats[0]!.goalsTotal = null;
    const entries = buildPlayerStatsChartEntries(stats, "clubA");
    expect(entries[0]!.values.goalsTotal).toBe(0);
  });
});
