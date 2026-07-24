import { describe, it, expect } from "vitest";
import { computeMatchOdds, computeMatchProbabilities, DEFAULT_ODDS_CONFIG, parseOddsConfig } from "./odds";

describe("computeMatchProbabilities", () => {
  it("clubs de force égale → distribution symétrique home/away, somme = 1", () => {
    const probs = computeMatchProbabilities({ homeStrength: 10, awayStrength: 10 });
    expect(probs.HOME).toBeCloseTo(probs.AWAY, 6);
    const sum = Object.values(probs).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("domicile beaucoup plus fort → probabilité de victoire domicile plus haute", () => {
    const equal = computeMatchProbabilities({ homeStrength: 10, awayStrength: 10 });
    const homeFavorite = computeMatchProbabilities({ homeStrength: 14, awayStrength: 6 });
    expect(homeFavorite.HOME).toBeGreaterThan(equal.HOME);
    expect(homeFavorite.AWAY).toBeLessThan(equal.AWAY);
  });

  it("somme toujours égale à 1 même avec un écart de force extrême", () => {
    const probs = computeMatchProbabilities({ homeStrength: 100, awayStrength: 1 });
    const sum = Object.values(probs).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(Object.values(probs).every((p) => p > 0)).toBe(true);
  });
});

describe("computeMatchOdds", () => {
  it("cote = inverse de la probabilité, réduite par la marge bookmaker", () => {
    const odds = computeMatchOdds({ homeStrength: 10, awayStrength: 10 });
    const probs = computeMatchProbabilities({ homeStrength: 10, awayStrength: 10 });
    const expected = Math.round((1 / probs.DRAW) * (1 - DEFAULT_ODDS_CONFIG.bookmakerMargin) * 100) / 100;
    expect(odds.DRAW).toBeCloseTo(expected, 2);
  });

  it("favori net → cote plus basse sur son issue que sur celle du outsider", () => {
    const odds = computeMatchOdds({ homeStrength: 14, awayStrength: 6 });
    expect(odds.HOME).toBeLessThan(odds.AWAY);
  });

  it("toutes les cotes restent >= 1.01", () => {
    const odds = computeMatchOdds({ homeStrength: 100, awayStrength: 1 });
    expect(Object.values(odds).every((o) => o >= 1.01)).toBe(true);
  });
});

describe("parseOddsConfig", () => {
  it("valeurs par défaut si GameConfig absent", () => {
    expect(parseOddsConfig({})).toEqual(DEFAULT_ODDS_CONFIG);
  });

  it("lit les valeurs GameConfig fournies", () => {
    const config = parseOddsConfig({ PREDICTION_BOOKMAKER_MARGIN: "0.1" });
    expect(config.bookmakerMargin).toBe(0.1);
  });
});
