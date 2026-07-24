import { describe, it, expect } from "vitest";
import { matchPlayerSeasonScores, type PlayerForScoreMatching, type ScrapedScoreRow } from "./lnh-score-matching";

function row(overrides: Partial<ScrapedScoreRow> = {}): ScrapedScoreRow {
  return { firstName: "Mehdi", lastName: "Harbaoui", clubShortName: "USDK", matchesPlayed: 20, totalScore: 100, ...overrides };
}

function player(overrides: Partial<PlayerForScoreMatching> = {}): PlayerForScoreMatching {
  return { id: "p1", firstName: "Mehdi", lastName: "Harbaoui", clubShortName: "CCMHB", ...overrides };
}

describe("matchPlayerSeasonScores", () => {
  it("matches exact name+club with high confidence (matchedByNameOnly=false)", () => {
    const result = matchPlayerSeasonScores([row({ clubShortName: "CCMHB" })], [player()]);
    expect(result.matches).toEqual([
      { playerId: "p1", matchesPlayed: 20, totalScore: 100, avgScore: 5, scrapedClub: "CCMHB", matchedByNameOnly: false },
    ]);
    expect(result.unmatched).toHaveLength(0);
  });

  it("falls back to name-only match when the club differs (transfer case), flagging matchedByNameOnly", () => {
    // Le joueur est en base à CCMHB (club actuel) mais le score scrapé le montre à USDK (club de la saison passée)
    const result = matchPlayerSeasonScores([row({ clubShortName: "USDK" })], [player({ clubShortName: "CCMHB" })]);
    expect(result.matches).toEqual([
      { playerId: "p1", matchesPlayed: 20, totalScore: 100, avgScore: 5, scrapedClub: "USDK", matchedByNameOnly: true },
    ]);
    expect(result.unmatched).toHaveLength(0);
  });

  it("reports ambiguous_match when the name-only fallback matches multiple players", () => {
    const players = [
      player({ id: "p1", clubShortName: "CCMHB" }),
      player({ id: "p2", clubShortName: "PSG" }),
    ];
    const result = matchPlayerSeasonScores([row({ clubShortName: "USDK" })], players);
    expect(result.matches).toHaveLength(0);
    expect(result.unmatched).toEqual([{ row: row({ clubShortName: "USDK" }), reason: "ambiguous_match" }]);
  });

  it("reports player_not_found when neither the club nor the name matches anyone", () => {
    const result = matchPlayerSeasonScores([row({ firstName: "Inconnu" })], [player()]);
    expect(result.unmatched).toEqual([{ row: row({ firstName: "Inconnu" }), reason: "player_not_found" }]);
  });

  it("never invents a club — the DB club assignment is untouched, only scrapedClub/matchedByNameOnly report the discrepancy", () => {
    const result = matchPlayerSeasonScores([row({ clubShortName: "USDK" })], [player({ clubShortName: "CCMHB" })]);
    // Le club "actuel" du joueur (CCMHB) n'apparaît nulle part dans le résultat — seul playerId est renvoyé,
    // à charge de l'appelant de ne mettre à jour que le score, jamais Player.clubId.
    expect(result.matches[0]!.scrapedClub).toBe("USDK");
  });

  it("prefers the exact match over the name-only fallback when both exist", () => {
    // Deux joueurs de même nom : un au bon club (exact), un ailleurs (aurait pu faire un faux-positif nom seul)
    const players = [
      player({ id: "exact", clubShortName: "USDK" }),
      player({ id: "other-club", clubShortName: "PSG" }),
    ];
    const result = matchPlayerSeasonScores([row({ clubShortName: "USDK" })], players);
    expect(result.matches).toEqual([
      { playerId: "exact", matchesPlayed: 20, totalScore: 100, avgScore: 5, scrapedClub: "USDK", matchedByNameOnly: false },
    ]);
  });

  it("handles case/accent-insensitive matching", () => {
    const result = matchPlayerSeasonScores(
      [row({ firstName: "MEHDI", lastName: "harbaoui", clubShortName: "ccmhb" })],
      [player({ firstName: "Méhdi", clubShortName: "CCMHB" })],
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.matchedByNameOnly).toBe(false);
  });

  it("handles an empty row list", () => {
    expect(matchPlayerSeasonScores([], [player()])).toEqual({ matches: [], unmatched: [] });
  });
});
