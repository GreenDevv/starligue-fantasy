import { describe, it, expect } from "vitest";
import { normalizeTitle, titleSimilarity, findNearDuplicate, type DedupeCandidate } from "./dedupe";

describe("normalizeTitle", () => {
  it("strips accents, punctuation and collapses whitespace", () => {
    expect(normalizeTitle("Chartres : Rémi Desbonnet prolonge !")).toBe(
      "chartres remi desbonnet prolonge"
    );
  });

  it("is case-insensitive", () => {
    expect(normalizeTitle("MONTPELLIER gagne")).toBe(normalizeTitle("montpellier GAGNE"));
  });
});

describe("titleSimilarity", () => {
  it("returns 1 for identical titles regardless of case/accents", () => {
    expect(titleSimilarity("Nikola Karabatic prolonge à Montpellier", "nikola karabatic PROLONGE a montpellier")).toBe(1);
  });

  it("returns a high score for the same story with a different title", () => {
    const a = "Nikola Karabatic prolonge son contrat à Montpellier Handball";
    const b = "Karabatic prolonge à Montpellier";
    expect(titleSimilarity(a, b)).toBeGreaterThan(0.4);
  });

  it("returns 0 for unrelated titles", () => {
    expect(titleSimilarity("Paris s'impose face à Nantes", "Le classement de la journée 12")).toBeLessThan(0.3);
  });

  it("returns 0 when either title is empty", () => {
    expect(titleSimilarity("", "Paris gagne")).toBe(0);
  });
});

describe("findNearDuplicate", () => {
  function item(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
    return {
      title: "Nikola Karabatic prolonge à Montpellier",
      publishedAt: new Date("2026-08-01T10:00:00Z"),
      category: "TRANSFER",
      clubId: "club-mhb",
      ...overrides,
    };
  }

  it("flags a near-identical title from another source, same day, same club as a duplicate", () => {
    const candidate = item({ title: "Karabatic prolonge son contrat au MHB" });
    expect(findNearDuplicate(candidate, [item()])).toBe(true);
  });

  it("does not flag titles about different clubs even if wording overlaps", () => {
    const candidate = item({ clubId: "club-psg", title: "Un joueur prolonge à Paris" });
    expect(findNearDuplicate(candidate, [item()])).toBe(false);
  });

  it("does not flag when the category differs", () => {
    const candidate = item({ category: "GENERAL" });
    expect(findNearDuplicate(candidate, [item()])).toBe(false);
  });

  it("does not flag when the publish dates are too far apart", () => {
    const candidate = item({ publishedAt: new Date("2026-08-10T10:00:00Z") });
    expect(findNearDuplicate(candidate, [item()])).toBe(false);
  });

  it("does not flag unrelated titles even same day/club", () => {
    const candidate = item({ title: "Le club annonce son nouveau maillot" });
    expect(findNearDuplicate(candidate, [item()])).toBe(false);
  });

  it("allows a match when one side has no clubId (lnh.fr articles are cross-club)", () => {
    const candidate = item({ clubId: null, title: "Karabatic prolonge son contrat au MHB" });
    expect(findNearDuplicate(candidate, [item()])).toBe(true);
  });
});
