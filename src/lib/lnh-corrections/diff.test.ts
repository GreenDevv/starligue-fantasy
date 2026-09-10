import { describe, it, expect } from "vitest";
import {
  normalizeValue,
  diffStatFields,
  buildStatCorrections,
  correctionKey,
  type StoredStatRow,
  type ScrapedStatRow,
} from "./diff";

describe("normalizeValue", () => {
  it("ramène Decimal-like et string numérique à un number", () => {
    expect(normalizeValue({ toString: () => "6.5" })).toBe(6.5);
    expect(normalizeValue("50")).toBe(50);
    expect(normalizeValue("")).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(3)).toBe(3);
  });
});

describe("diffStatFields", () => {
  it("Decimal stocké vs number scrapé, valeur identique → aucun écart", () => {
    const stored = { lnhRating: { toString: () => "6.5" }, shotPercentage: { toString: () => "50" } };
    const scraped = { lnhRating: 6.5, shotPercentage: 50 };
    expect(diffStatFields(stored, scraped)).toEqual([]);
  });

  it("repère une note corrigée et une stat corrigée", () => {
    const stored = { lnhRating: 7.1, assists: 3, neutralizations: 0 };
    const scraped = { lnhRating: 10.1, assists: 6, neutralizations: 0 };
    const changes = diffStatFields(stored, scraped);
    expect(changes).toContainEqual({ field: "lnhRating", before: 7.1, after: 10.1 });
    expect(changes).toContainEqual({ field: "assists", before: 3, after: 6 });
    expect(changes.find((c) => c.field === "neutralizations")).toBeUndefined();
  });

  it("null des deux côtés → pas un écart", () => {
    expect(diffStatFields({ saves: null }, {})).toEqual([]);
  });
});

describe("buildStatCorrections", () => {
  const stored: StoredStatRow[] = [
    { matchId: "m1", playerId: "p1", lnhRating: 7.1, assists: 3 },
    { matchId: "m1", playerId: "p2", lnhRating: 5, assists: 1 },
    { matchId: "m1", playerId: "p3", lnhRating: 12, assists: 0 },
  ];
  const scraped: ScrapedStatRow[] = [
    { matchId: "m1", playerId: "p1", lnhRating: 10.1, assists: 6 },
    { matchId: "m1", playerId: "p2", lnhRating: 5, assists: 2 },
    { matchId: "m1", playerId: "p3", lnhRating: 12, assists: 0 },
  ];

  it("ne renvoie que les couples match+joueur modifiés", () => {
    const corr = buildStatCorrections(stored, scraped);
    expect(corr.map((c) => c.playerId).sort()).toEqual(["p1", "p2"]);
  });

  it("classe les corrections de note avant les autres, par ampleur", () => {
    const corr = buildStatCorrections(stored, scraped);
    expect(corr[0]!.playerId).toBe("p1"); // note changée (+3.0)
    expect(corr[0]!.ratingChanged).toBe(true);
    expect(corr[0]!.ratingBefore).toBe(7.1);
    expect(corr[0]!.ratingAfter).toBe(10.1);
    expect(corr[1]!.playerId).toBe("p2"); // seulement assists
    expect(corr[1]!.ratingChanged).toBe(false);
  });

  it("clé stable matchId:playerId", () => {
    const corr = buildStatCorrections(stored, scraped);
    expect(corr.find((c) => c.playerId === "p1")!.key).toBe(correctionKey("m1", "p1"));
  });

  it("ligne scrapée sans stat enregistrée → correction avec before null", () => {
    const corr = buildStatCorrections([], [{ matchId: "m2", playerId: "p9", lnhRating: 8, played: true }]);
    expect(corr).toHaveLength(1);
    expect(corr[0]!.ratingBefore).toBeNull();
    expect(corr[0]!.ratingAfter).toBe(8);
  });
});
