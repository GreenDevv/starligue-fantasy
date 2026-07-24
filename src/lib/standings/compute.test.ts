import { describe, it, expect } from "vitest";
import { computeClubStandings } from "./compute";

const CLUBS = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];

describe("computeClubStandings", () => {
  it("returns all clubs at zero when no match has been played", () => {
    const rows = computeClubStandings(CLUBS, []);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({ points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalAvg: 0 });
    }
    // tie-break alphabétique quand tout est à égalité
    expect(rows.map((r) => r.clubId)).toEqual(["a", "b", "c"]);
  });

  it("awards 2 points for a win, 0 for a loss", () => {
    const rows = computeClubStandings(CLUBS, [
      { homeClubId: "a", awayClubId: "b", homeScore: 30, awayScore: 25 },
    ]);
    const a = rows.find((r) => r.clubId === "a")!;
    const b = rows.find((r) => r.clubId === "b")!;
    expect(a).toMatchObject({ points: 2, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 30, goalsAgainst: 25, goalAvg: 5 });
    expect(b).toMatchObject({ points: 0, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 25, goalsAgainst: 30, goalAvg: -5 });
  });

  it("awards 1 point each for a draw", () => {
    const rows = computeClubStandings(CLUBS, [
      { homeClubId: "a", awayClubId: "b", homeScore: 28, awayScore: 28 },
    ]);
    const a = rows.find((r) => r.clubId === "a")!;
    const b = rows.find((r) => r.clubId === "b")!;
    expect(a.points).toBe(1);
    expect(a.draws).toBe(1);
    expect(b.points).toBe(1);
    expect(b.draws).toBe(1);
    expect(a.goalAvg).toBe(0);
  });

  it("accumulates points/goals across multiple matches for the same club", () => {
    const rows = computeClubStandings(CLUBS, [
      { homeClubId: "a", awayClubId: "b", homeScore: 30, awayScore: 25 },
      { homeClubId: "c", awayClubId: "a", homeScore: 20, awayScore: 27 },
    ]);
    const a = rows.find((r) => r.clubId === "a")!;
    expect(a).toMatchObject({ points: 4, played: 2, wins: 2, goalsFor: 57, goalsAgainst: 45, goalAvg: 12 });
  });

  it("ranks by points desc, then goal avg desc, then goals for desc, then name asc", () => {
    const rows = computeClubStandings(CLUBS, [
      // a: 1 win (2 pts, avg +5) ; b: 1 win (2 pts, avg +2) ; c: winless
      { homeClubId: "a", awayClubId: "c", homeScore: 30, awayScore: 25 },
      { homeClubId: "b", awayClubId: "c", homeScore: 27, awayScore: 25 },
    ]);
    expect(rows.map((r) => r.clubId)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ignores a match referencing an unknown club id", () => {
    const rows = computeClubStandings(CLUBS, [
      { homeClubId: "a", awayClubId: "unknown", homeScore: 30, awayScore: 25 },
    ]);
    const a = rows.find((r) => r.clubId === "a")!;
    expect(a).toMatchObject({ points: 0, played: 0 });
  });
});
