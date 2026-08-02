import { describe, it, expect } from "vitest";
import { computeGroupStandings } from "./group-standings";

const TEAMS = ["HBC Nantes", "MT Melsungen", "Orlen Wisla Plock", "HC Vardar 1961"];

describe("computeGroupStandings", () => {
  it("liste toutes les équipes même sans aucun match joué (0 partout)", () => {
    const standings = computeGroupStandings(TEAMS, []);
    expect(standings).toHaveLength(4);
    for (const s of standings) {
      expect(s.played).toBe(0);
      expect(s.points).toBe(0);
    }
  });

  it("ignore un match pas encore joué (scores null)", () => {
    const standings = computeGroupStandings(TEAMS, [
      { homeTeamName: "HBC Nantes", awayTeamName: "MT Melsungen", homeScore: null, awayScore: null },
    ]);
    expect(standings.find((s) => s.teamName === "HBC Nantes")!.played).toBe(0);
  });

  it("victoire à domicile : 2 pts au vainqueur, 0 au perdant", () => {
    const standings = computeGroupStandings(TEAMS, [
      { homeTeamName: "HBC Nantes", awayTeamName: "MT Melsungen", homeScore: 30, awayScore: 25 },
    ]);
    const nantes = standings.find((s) => s.teamName === "HBC Nantes")!;
    const melsungen = standings.find((s) => s.teamName === "MT Melsungen")!;
    expect(nantes.points).toBe(2);
    expect(nantes.wins).toBe(1);
    expect(melsungen.points).toBe(0);
    expect(melsungen.losses).toBe(1);
  });

  it("match nul : 1 pt chacun", () => {
    const standings = computeGroupStandings(TEAMS, [
      { homeTeamName: "HBC Nantes", awayTeamName: "MT Melsungen", homeScore: 28, awayScore: 28 },
    ]);
    expect(standings.find((s) => s.teamName === "HBC Nantes")!.points).toBe(1);
    expect(standings.find((s) => s.teamName === "MT Melsungen")!.points).toBe(1);
    expect(standings.find((s) => s.teamName === "HBC Nantes")!.draws).toBe(1);
  });

  it("cumule buts pour/contre et diff sur plusieurs matchs", () => {
    const standings = computeGroupStandings(TEAMS, [
      { homeTeamName: "HBC Nantes", awayTeamName: "MT Melsungen", homeScore: 30, awayScore: 25 },
      { homeTeamName: "Orlen Wisla Plock", awayTeamName: "HBC Nantes", homeScore: 20, awayScore: 27 },
    ]);
    const nantes = standings.find((s) => s.teamName === "HBC Nantes")!;
    expect(nantes.played).toBe(2);
    expect(nantes.goalsFor).toBe(57);
    expect(nantes.goalsAgainst).toBe(45);
    expect(nantes.goalDiff).toBe(12);
    expect(nantes.points).toBe(4);
  });

  it("classe par points desc, puis diff de buts desc, puis buts pour desc", () => {
    const standings = computeGroupStandings(TEAMS, [
      // Nantes et Vardar finissent à 2 pts chacun (1 victoire), Vardar avec une meilleure diff
      { homeTeamName: "HBC Nantes", awayTeamName: "MT Melsungen", homeScore: 26, awayScore: 25 },
      { homeTeamName: "HC Vardar 1961", awayTeamName: "Orlen Wisla Plock", homeScore: 35, awayScore: 20 },
    ]);
    const ranks = standings.map((s) => s.teamName);
    expect(ranks[0]).toBe("HC Vardar 1961");
    expect(ranks[1]).toBe("HBC Nantes");
  });

  it("assigne un rang de 1 à N sans trou", () => {
    const standings = computeGroupStandings(TEAMS, []);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it("ignore un match dont une équipe n'est pas dans la liste des équipes du groupe", () => {
    const standings = computeGroupStandings(TEAMS, [
      { homeTeamName: "HBC Nantes", awayTeamName: "Équipe inconnue", homeScore: 30, awayScore: 20 },
    ]);
    expect(standings.find((s) => s.teamName === "HBC Nantes")!.played).toBe(0);
  });
});
