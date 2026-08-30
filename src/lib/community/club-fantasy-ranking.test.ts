import { describe, it, expect } from "vitest";
import { aggregateClubFantasyRanking, type ClubFantasyManagerRow } from "./club-fantasy-ranking";

const row = (o: Partial<ClubFantasyManagerRow>): ClubFantasyManagerRow => ({
  clubId: "a",
  clubName: "Club A",
  clubCity: "Ville A",
  clubCountry: "FR",
  points: 0,
  ...o,
});

describe("aggregateClubFantasyRanking", () => {
  it("somme les points des managers par club et compte les managers", () => {
    const ranking = aggregateClubFantasyRanking([
      row({ clubId: "a", clubName: "Club A", points: 30 }),
      row({ clubId: "a", clubName: "Club A", points: 12 }),
      row({ clubId: "b", clubName: "Club B", points: 50 }),
    ]);
    expect(ranking).toEqual([
      { rank: 1, clubId: "b", clubName: "Club B", clubCity: "Ville A", clubCountry: "FR", managers: 1, points: 50 },
      { rank: 2, clubId: "a", clubName: "Club A", clubCity: "Ville A", clubCountry: "FR", managers: 2, points: 42 },
    ]);
  });

  it("départage à points égaux par nombre de managers puis par nom", () => {
    const ranking = aggregateClubFantasyRanking([
      row({ clubId: "z", clubName: "Zorro HB", points: 0 }),
      row({ clubId: "b", clubName: "Beta HB", points: 0 }),
      row({ clubId: "b", clubName: "Beta HB", points: 0 }),
      row({ clubId: "a", clubName: "Alpha HB", points: 0 }),
    ]);
    expect(ranking.map((r) => r.clubName)).toEqual(["Beta HB", "Alpha HB", "Zorro HB"]);
  });

  it("garde les clubs sans aucun point (tous à 0 en début de saison)", () => {
    const ranking = aggregateClubFantasyRanking([row({ clubId: "a", points: 0 }), row({ clubId: "b", clubName: "Club B", points: 0 })]);
    expect(ranking).toHaveLength(2);
    expect(ranking.every((r) => r.points === 0)).toBe(true);
  });
});
