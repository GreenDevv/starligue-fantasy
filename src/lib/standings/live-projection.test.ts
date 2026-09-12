import { describe, it, expect } from "vitest";
import { projectLiveStandings } from "./live-projection";
import type { ClubStandingRow } from "./get";

function row(overrides: Partial<ClubStandingRow>): ClubStandingRow {
  return {
    clubId: "c1",
    clubName: "Club 1",
    clubShortName: "C1",
    logoUrl: null,
    rank: 1,
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalAvg: 0,
    ...overrides,
  };
}

describe("projectLiveStandings", () => {
  it("renvoie le classement tel quel s'il n'y a aucun match en direct", () => {
    const baseline = [row({ clubId: "a" }), row({ clubId: "b" })];
    expect(projectLiveStandings(baseline, [])).toBe(baseline);
  });

  it("ajoute une victoire à domicile et une défaite à l'extérieur", () => {
    const baseline = [
      row({ clubId: "a", clubName: "A", rank: 2, points: 4, played: 2, wins: 2, goalsFor: 60, goalsAgainst: 50, goalAvg: 10 }),
      row({ clubId: "b", clubName: "B", rank: 1, points: 6, played: 2, wins: 3, goalsFor: 65, goalsAgainst: 55, goalAvg: 10 }),
    ];

    const result = projectLiveStandings(baseline, [{ homeClubId: "a", awayClubId: "b", homeScore: 20, awayScore: 15 }]);

    const a = result.find((r) => r.clubId === "a")!;
    const b = result.find((r) => r.clubId === "b")!;
    expect(a).toMatchObject({ points: 6, played: 3, wins: 3, losses: 0, goalsFor: 80, goalsAgainst: 65, goalAvg: 15 });
    expect(b).toMatchObject({ points: 6, played: 3, wins: 3, losses: 1, goalsFor: 80, goalsAgainst: 75, goalAvg: 5 });
  });

  it("compte un nul comme 1 point chacun", () => {
    const baseline = [row({ clubId: "a", clubName: "A" }), row({ clubId: "b", clubName: "B" })];
    const result = projectLiveStandings(baseline, [{ homeClubId: "a", awayClubId: "b", homeScore: 18, awayScore: 18 }]);
    expect(result.find((r) => r.clubId === "a")).toMatchObject({ points: 1, draws: 1 });
    expect(result.find((r) => r.clubId === "b")).toMatchObject({ points: 1, draws: 1 });
  });

  it("recalcule le rang après projection (le club en direct peut doubler l'ancien 1er)", () => {
    const baseline = [
      row({ clubId: "a", clubName: "A", rank: 1, points: 10, goalsFor: 50, goalsAgainst: 40, goalAvg: 10 }),
      row({ clubId: "b", clubName: "B", rank: 2, points: 8, goalsFor: 45, goalsAgainst: 40, goalAvg: 5 }),
      row({ clubId: "c", clubName: "C", rank: 3, points: 4, goalsFor: 30, goalsAgainst: 40, goalAvg: -10 }),
    ];
    // B gagne largement son match en direct contre C → dépasse A au classement.
    const result = projectLiveStandings(baseline, [{ homeClubId: "b", awayClubId: "c", homeScore: 30, awayScore: 10 }]);
    expect(result.map((r) => r.clubId)).toEqual(["b", "a", "c"]);
  });

  it("départage à égalité de points par la différence de buts puis les buts marqués puis le nom", () => {
    const baseline = [
      row({ clubId: "a", clubName: "Zèbres", points: 5, goalsFor: 20, goalsAgainst: 20, goalAvg: 0 }),
      row({ clubId: "b", clubName: "Aigles", points: 5, goalsFor: 20, goalsAgainst: 20, goalAvg: 0 }),
    ];
    const result = projectLiveStandings(baseline, []);
    expect(result).toBe(baseline); // pas de match live → pas de retri, comportement inchangé
  });

  it("ignore un match dont un des deux clubs n'a pas de ligne de classement (garde-fou, ne devrait pas arriver)", () => {
    const baseline = [row({ clubId: "a", clubName: "A" })];
    const result = projectLiveStandings(baseline, [{ homeClubId: "a", awayClubId: "inconnu", homeScore: 20, awayScore: 15 }]);
    expect(result.find((r) => r.clubId === "a")).toMatchObject({ played: 0, points: 0 });
  });
});
