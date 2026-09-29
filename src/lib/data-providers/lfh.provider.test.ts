import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  parseLfhRencontres,
  parseLfhMatchPlayerStats,
  parseLfhStandings,
  parseLfhPlayersPage,
  parseVisionSportSheet,
  parseVisionSportTime,
  mergeLfhMatchStats,
} from "./lfh.provider";
import { computeMatchRating, DEFAULT_COMPUTED_RATING_WEIGHTS, ZERO_POSITION_BASE } from "@/lib/scoring/computed-rating";

// Réponses réelles capturées le 2026-09-29 (ARCHITECTURE.md §35.2) :
// calendrier poule 98 (LBE 2026-27, extrait), feuille officielle et feuille
// vision-sport de Brest–Besançon J1 (rencontre 2852 / LIVE001LFH, 28-21).
const fixture = (name: string) => resolve(__dirname, "__fixtures__", name);
const json = (name: string) => JSON.parse(readFileSync(fixture(name), "utf-8"));
const visionHtml = () => new TextDecoder("latin1").decode(readFileSync(fixture("vision-sport-LIVE001LFH.html")));

describe("parseLfhRencontres", () => {
  const fixtures = parseLfhRencontres(json("lfh-rencontres-poule98.json"));

  it("lit journée, équipes, score, et date en UTC", () => {
    const m = fixtures.find((f) => f.rencontreId === "2852")!;
    expect(m.extRencontreId).toBe("2625116");
    expect(m.gameweekNumber).toBe(1);
    expect(m.home.sigle).toBe("BBH");
    expect(m.away.sigle).toBe("ESBF");
    expect(m.home.clubPageUrl).toBe("https://ligue-feminine-handball.fr/clubs/brest-bretagne-handball/");
    expect([m.homeScore, m.awayScore, m.status]).toEqual([28, 21, "FINISHED"]);
    expect(m.kickoffAt?.toISOString()).toBe("2026-08-29T15:45:00.000Z");
  });

  it("sigle vide → null ; match sans date ni score → SCHEDULED", () => {
    expect(fixtures.find((f) => f.rencontreId === "2857")!.home.sigle).toBeNull();
    const later = fixtures.find((f) => f.rencontreId === "2918")!;
    expect(later.kickoffAt).toBeNull();
    expect(later.status).toBe("SCHEDULED");
    expect(later.homeScore).toBeNull();
  });
});

describe("parseLfhMatchPlayerStats", () => {
  it("feuille officielle : buts, 7 m, sanctions, identité fédérale", () => {
    const rows = parseLfhMatchPlayerStats(json("lfh-stats-joueurs-rencontre2852.json"));
    expect(rows).toHaveLength(30);
    const mairot = rows.find((r) => r.lastName === "MAIROT" && r.teamId === "592")!;
    expect(mairot).toMatchObject({ shirtNumber: 8, goals: 9, penaltyGoals: 2, warnings: 1, twoMin: 0, wpPlayerId: 13725 });
    expect(rows.reduce((s, r) => s + (r.teamId === "592" ? r.goals : 0), 0)).toBe(28);
  });
});

describe("parseLfhStandings", () => {
  it("rang, points, bilan", () => {
    const [first] = parseLfhStandings(json("lfh-classements-poule98.json"));
    expect(first).toMatchObject({ rank: 1, points: 12, played: 4, won: 4, lost: 0, goalsFor: 161, goalsAgainst: 90 });
    expect(first!.team.sigle).toBe("MHB");
  });
});

describe("parseLfhPlayersPage", () => {
  it("poste LFH → notre enum, pagination", () => {
    const { players, totalPages } = parseLfhPlayersPage(json("lfh-players-page1.json"));
    expect(totalPages).toBeGreaterThan(1);
    expect(players.length).toBe(12);
    expect(players.find((p) => p.lastName === "ABIVEN")!.clubPageUrl).toBeNull(); // sans club
    const abadie = players.find((p) => p.lastName === "ABADIE")!;
    expect(abadie.position).toBe("RW"); // code 3 = Ailière droite
    expect(abadie.clubName).toBe("Stade Pessacais Union Club Handball");
  });
});

describe("parseVisionSportTime", () => {
  it("minutes, secondes, vide", () => {
    expect(parseVisionSportTime("52mn")).toBe(3120);
    expect(parseVisionSportTime("08sc")).toBe(8);
    expect(parseVisionSportTime("")).toBe(0);
  });
});

describe("parseVisionSportSheet", () => {
  const sheet = parseVisionSportSheet(visionHtml());

  it("en-tête : équipes, score, statut", () => {
    expect(sheet).toMatchObject({ homeTeamName: "BREST", awayTeamName: "BESANCON", homeScore: 28, awayScore: 21, finished: true });
  });

  it("joueuses : buts, tirs tentés, 2 min, temps de jeu", () => {
    const mairot = sheet.players.find((p) => p.side === "home" && p.shirtNumber === 8)!;
    expect(mairot).toMatchObject({ lastName: "MAIROT", goals: 9, shots: 12, twoMin: 0, secondsPlayed: 3120 });
    const ondono = sheet.players.find((p) => p.lastName === "ONDONO")!;
    expect(ondono.twoMin).toBe(1);
    // La saisie live vision-sport compte 29 buts pour Brest (ONDONO 3 au lieu de 2)
    // alors que le score final est 28-21 : les buts officiels font foi à la fusion.
    expect(sheet.players.filter((p) => p.side === "home").reduce((s, p) => s + p.goals, 0)).toBe(29);
  });

  it("gardiennes : arrêts, tirs subis, 7 m", () => {
    const andre = sheet.goalkeepers.find((g) => g.lastName === "ANDRE")!;
    expect(andre).toMatchObject({ side: "home", saves: 15, shotsFaced: 35, penaltySaves: 0, penaltyGoalsConceded: 3, secondsPlayed: 3540 });
    const tonds = sheet.goalkeepers.find((g) => g.lastName === "TONDS")!;
    expect(tonds).toMatchObject({ side: "away", saves: 13, shotsFaced: 41 });
  });

  it("page aux en-têtes de colonnes vides (LIVE010LFH, Nice–St-Amand J2) : tableaux reconnus par leur forme", () => {
    const html = new TextDecoder("latin1").decode(readFileSync(fixture("vision-sport-LIVE010LFH-sans-entetes.html")));
    const s = parseVisionSportSheet(html);
    expect([s.homeScore, s.awayScore]).toEqual([23, 27]);
    expect(s.goalkeepers.find((g) => g.lastName === "COLIC")).toMatchObject({ side: "home", saves: 10, shotsFaced: 26 });
    expect(s.players.find((p) => p.lastName === "TECHER")).toMatchObject({ side: "away", goals: 6, shots: 10, twoMin: 2 }); // = feuille officielle
  });

  it("échoue bruyamment si la structure change", () => {
    expect(() => parseVisionSportSheet("<html><span class='x'></span></html>")).toThrow(/vision-sport/);
    // Libellé de colonne présent mais différent → refus plutôt qu'une colonne décalée.
    const renamed = visionHtml().replace(/>Tir</g, ">Tirs cadrés<");
    expect(() => parseVisionSportSheet(renamed)).toThrow(/tableaux joueuses/);
  });
});

describe("mergeLfhMatchStats", () => {
  const official = parseLfhMatchPlayerStats(json("lfh-stats-joueurs-rencontre2852.json"));
  const sheet = parseVisionSportSheet(visionHtml());
  const merged = mergeLfhMatchStats(official, sheet, "592");

  it("joueuse de champ : buts officiels + tirs et temps vision-sport", () => {
    const m = merged.find((r) => r.lastName === "MAIROT" && r.teamId === "592")!;
    expect(m).toMatchObject({ goalsTotal: 9, goalsPenalty: 2, goalsPlay: 7, shotsTotal: 12, played: true, isGoalkeeper: false });
    expect(m.shotPercentage).toBe(75);
  });

  it("gardienne : arrêts et tirs subis rattachés", () => {
    const andre = merged.find((r) => r.lastName === "ANDRE")!;
    expect(andre).toMatchObject({ isGoalkeeper: true, saves: 15, shotsFaced: 35, played: true });
  });

  it("sur la feuille mais sans temps de jeu → n'a pas joué", () => {
    const renaud = merged.find((r) => r.lastName === "RENAUD")!;
    expect(renaud.played).toBe(false);
    expect(renaud.secondsPlayed).toBe(0);
  });

  it("sans feuille vision-sport : stats officielles seules, tirs/arrêts inconnus", () => {
    const fallback = mergeLfhMatchStats(official, null, "592");
    const m = fallback.find((r) => r.lastName === "MAIROT" && r.teamId === "592")!;
    expect(m).toMatchObject({ goalsTotal: 9, shotsTotal: null, saves: null, secondsPlayed: null, played: true });
    expect(fallback.find((r) => r.lastName === "RENAUD")!.played).toBe(false);
  });

  it("de bout en bout : note calculée de la meilleure buteuse et de la gardienne", () => {
    const raw = { ...DEFAULT_COMPUTED_RATING_WEIGHTS, base: ZERO_POSITION_BASE };
    const rate = (name: string, position: "LB" | "GK" | "CB") => {
      const r = merged.find((x) => x.lastName === name && x.teamId === "592")!;
      return computeMatchRating(r, { played: r.played, position }, raw);
    };
    expect(rate("MAIROT", "LB")).toBe(16.1);
    expect(rate("ANDRE", "GK")).toBe(20.5);
    expect(rate("RENAUD", "CB")).toBeNull();
  });
});
