import { describe, it, expect } from "vitest";
import {
  computePlayerPoints,
  computeLineupPoints,
  parseScoringConfig,
  applySeasonBonus,
  DEFAULT_CONFIG,
} from "./engine";

describe("computePlayerPoints", () => {
  it("note 8 titulaire → +12", () => {
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: false }),
    ).toBe(12);
  });

  it("note 3 titulaire → -8", () => {
    expect(
      computePlayerPoints({ lnhRating: 3, played: true, role: "STARTER", teamWon: false }),
    ).toBe(-8);
  });

  it("note 5 (baseline) → 0 point", () => {
    expect(
      computePlayerPoints({ lnhRating: 5, played: true, role: "STARTER", teamWon: false }),
    ).toBe(0);
  });

  it("remplaçant ×0.5 : note 8 → +6", () => {
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "BENCH", teamWon: false }),
    ).toBe(6);
  });

  it("remplaçant ×0.5 : note 3 → -4", () => {
    expect(
      computePlayerPoints({ lnhRating: 3, played: true, role: "BENCH", teamWon: false }),
    ).toBe(-4);
  });

  it("joueur non noté (lnhRating null) → 0", () => {
    expect(
      computePlayerPoints({ lnhRating: null, played: true, role: "STARTER", teamWon: false }),
    ).toBe(0);
  });

  it("joueur n'a pas joué → 0", () => {
    expect(
      computePlayerPoints({ lnhRating: 7, played: false, role: "STARTER", teamWon: false }),
    ).toBe(0);
  });

  it("note décimale : 7.5 titulaire → +10", () => {
    // (7.5 - 5) × 4 × 1.0 = 10.0
    expect(
      computePlayerPoints({ lnhRating: 7.5, played: true, role: "STARTER", teamWon: false }),
    ).toBe(10);
  });

  it("note décimale : 6.5 remplaçant → +3", () => {
    // (6.5 - 5) × 4 × 0.5 = 3.0
    expect(
      computePlayerPoints({ lnhRating: 6.5, played: true, role: "BENCH", teamWon: false }),
    ).toBe(3);
  });

  it("bonus victoire (enabled) ajoute +2 au titulaire ayant joué", () => {
    const config = { ...DEFAULT_CONFIG, winBonusEnabled: true, winBonusPoints: 2 };
    // (8 - 5) × 4 × 1.0 + 2 = 14
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: true }, config),
    ).toBe(14);
  });

  it("bonus victoire (enabled) mais équipe a perdu → pas de bonus", () => {
    const config = { ...DEFAULT_CONFIG, winBonusEnabled: true };
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: false }, config),
    ).toBe(12);
  });

  it("bonus victoire (disabled) → pas de bonus même si victoire", () => {
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: true }),
    ).toBe(12);
  });

  it("arrondi à 1 décimale : note 6.3 titulaire", () => {
    // (6.3 - 5) × 4 × 1.0 = 5.2
    expect(
      computePlayerPoints({ lnhRating: 6.3, played: true, role: "STARTER", teamWon: false }),
    ).toBe(5.2);
  });

  it("capitaine titulaire : note 8 → ×2 en plus du multiplicateur titulaire", () => {
    // (8 - 5) × 4 × 1.0 × 2.0 = 24
    expect(
      computePlayerPoints({
        lnhRating: 8,
        played: true,
        role: "STARTER",
        teamWon: false,
        isCaptain: true,
      }),
    ).toBe(24);
  });

  it("capitaine sur le banc : le ×2 s'applique quand même au multiplicateur banc", () => {
    // (8 - 5) × 4 × 0.5 × 2.0 = 12 — le bonus capitaine suit le rôle courant,
    // c'est à l'appelant (compute.ts) de ne le marquer isCaptain que si STARTER
    expect(
      computePlayerPoints({
        lnhRating: 8,
        played: true,
        role: "BENCH",
        teamWon: false,
        isCaptain: true,
      }),
    ).toBe(12);
  });

  it("capitaine avec note négative : le malus est aussi doublé", () => {
    // (3 - 5) × 4 × 1.0 × 2.0 = -16
    expect(
      computePlayerPoints({
        lnhRating: 3,
        played: true,
        role: "STARTER",
        teamWon: false,
        isCaptain: true,
      }),
    ).toBe(-16);
  });

  it("isCaptain absent (undefined) équivaut à false", () => {
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: false }),
    ).toBe(12);
  });

  it("statBonusPoints ajouté à plat, après le multiplicateur capitaine", () => {
    // (8-5)×4×1.0×2.0 (capitaine) + 4 (bonus leaders cumulés) = 28
    expect(
      computePlayerPoints({
        lnhRating: 8,
        played: true,
        role: "STARTER",
        teamWon: false,
        isCaptain: true,
        statBonusPoints: 4,
      }),
    ).toBe(28);
  });

  it("statBonusPoints négatif (malus leader) réduit les points", () => {
    // (7-5)×4×1.0 - 2 = 6
    expect(
      computePlayerPoints({
        lnhRating: 7,
        played: true,
        role: "STARTER",
        teamWon: false,
        statBonusPoints: -2,
      }),
    ).toBe(6);
  });

  it("statBonusPoints absent équivaut à 0", () => {
    expect(
      computePlayerPoints({ lnhRating: 8, played: true, role: "STARTER", teamWon: false }),
    ).toBe(12);
  });

  it("joueur n'ayant pas joué → statBonusPoints ignoré (0 point quand même)", () => {
    expect(
      computePlayerPoints({
        lnhRating: 8,
        played: false,
        role: "STARTER",
        teamWon: false,
        statBonusPoints: 10,
      }),
    ).toBe(0);
  });
});

describe("computeLineupPoints", () => {
  it("lineup vide → 0", () => {
    expect(computeLineupPoints([])).toBe(0);
  });

  it("somme correcte sur 14 joueurs", () => {
    // 7 titulaires note 7 → (7-5)×4×1.0 = 8 chacun = 56
    // 7 remplaçants note 6 → (6-5)×4×0.5 = 2 chacun = 14
    // total = 70
    const starters = Array.from({ length: 7 }, () => ({
      lnhRating: 7 as number | null,
      played: true,
      role: "STARTER" as const,
      teamWon: false,
    }));
    const bench = Array.from({ length: 7 }, () => ({
      lnhRating: 6 as number | null,
      played: true,
      role: "BENCH" as const,
      teamWon: false,
    }));
    expect(computeLineupPoints([...starters, ...bench])).toBe(70);
  });

  it("joueurs non notés comptent 0", () => {
    const entries = [
      { lnhRating: null as null, played: false, role: "STARTER" as const, teamWon: false },
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries)).toBe(12);
  });
});

describe("applySeasonBonus", () => {
  it("aucun bonus (null/undefined) → config inchangée", () => {
    expect(applySeasonBonus(DEFAULT_CONFIG, null)).toEqual(DEFAULT_CONFIG);
    expect(applySeasonBonus(DEFAULT_CONFIG, undefined)).toEqual(DEFAULT_CONFIG);
  });

  it("TRIPLE_CAPTAIN remplace captainMultiplier par tripleCaptainMultiplier", () => {
    const cfg = applySeasonBonus(DEFAULT_CONFIG, "TRIPLE_CAPTAIN");
    expect(cfg.captainMultiplier).toBe(3.0);
    expect(cfg.benchMultiplier).toBe(0.5); // inchangé
  });

  it("BENCH_BOOST remplace benchMultiplier par benchBoostMultiplier", () => {
    const cfg = applySeasonBonus(DEFAULT_CONFIG, "BENCH_BOOST");
    expect(cfg.benchMultiplier).toBe(1.0);
    expect(cfg.captainMultiplier).toBe(2.0); // inchangé
  });

  it("STATISTICIAN remplace statBonusMultiplier par statisticianMultiplier", () => {
    const cfg = applySeasonBonus(DEFAULT_CONFIG, "STATISTICIAN");
    expect(cfg.statBonusMultiplier).toBe(2.0);
    expect(cfg.captainMultiplier).toBe(2.0); // inchangé
  });

  it("INSURANCE ne modifie aucun multiplicateur (géré dans computeLineupPoints)", () => {
    expect(applySeasonBonus(DEFAULT_CONFIG, "INSURANCE")).toEqual(DEFAULT_CONFIG);
  });
});

describe("computeLineupPoints avec bonus de saison", () => {
  it("Triple Capitaine : capitaine titulaire note 8 → ×3 au lieu de ×2", () => {
    // (8-5)×4×1.0×3.0 = 36
    const entries = [
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false, isCaptain: true },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "TRIPLE_CAPTAIN")).toBe(36);
  });

  it("Bench Boost : remplaçant note 8 → ×1 au lieu de ×0.5", () => {
    // (8-5)×4×1.0 = 12
    const entries = [
      { lnhRating: 8, played: true, role: "BENCH" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "BENCH_BOOST")).toBe(12);
  });

  it("Bench Boost n'affecte pas le capitaine titulaire (toujours ×2 classique)", () => {
    // (8-5)×4×1.0×2.0 = 24
    const entries = [
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false, isCaptain: true },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "BENCH_BOOST")).toBe(24);
  });

  it("aucun bonus (undefined) → comportement inchangé", () => {
    const entries = [
      { lnhRating: 8, played: true, role: "BENCH" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG)).toBe(6);
  });

  it("Statisticien : statBonusPoints doublé (leader de journée cumulé ×2 catégories)", () => {
    // (8-5)×4×1.0 + (4×2.0) = 12 + 8 = 20
    const entries = [
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false, statBonusPoints: 4 },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "STATISTICIAN")).toBe(20);
  });

  it("Statisticien : un malus leader (négatif) est aussi doublé", () => {
    // (7-5)×4×1.0 + (-2×2.0) = 8 - 4 = 4
    const entries = [
      { lnhRating: 7, played: true, role: "STARTER" as const, teamWon: false, statBonusPoints: -2 },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "STATISTICIAN")).toBe(4);
  });

  it("Assurance : un joueur qui finirait négatif compte 0 au lieu de son score", () => {
    // (3-5)×4×1.0 = -8 → plancher à 0
    const entries = [
      { lnhRating: 3, played: true, role: "STARTER" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "INSURANCE")).toBe(0);
  });

  it("Assurance : les joueurs positifs ne sont pas affectés", () => {
    // (8-5)×4×1.0 = 12, inchangé (déjà positif)
    const entries = [
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "INSURANCE")).toBe(12);
  });

  it("Assurance : plancher par joueur, pas sur le total (un très bon score compense mais chaque négatif est quand même remonté à 0)", () => {
    // joueur A : (8-5)×4×1.0 = 12 (positif, inchangé)
    // joueur B : (2-5)×4×1.0 = -12 → plancher à 0 (au lieu de -12)
    // total avec Assurance : 12 + 0 = 12 (sans Assurance : 12 - 12 = 0)
    const entries = [
      { lnhRating: 8, played: true, role: "STARTER" as const, teamWon: false },
      { lnhRating: 2, played: true, role: "STARTER" as const, teamWon: false },
    ];
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, "INSURANCE")).toBe(12);
    expect(computeLineupPoints(entries, DEFAULT_CONFIG, null)).toBe(0);
  });
});

describe("parseScoringConfig", () => {
  it("parse les valeurs du seed correctement", () => {
    const raw = {
      RATING_BASELINE: "5",
      RATING_MULTIPLIER: "4",
      STARTER_MULTIPLIER: "1.0",
      BENCH_MULTIPLIER: "0.5",
      WIN_BONUS_ENABLED: "false",
      WIN_BONUS_POINTS: "2",
      CAPTAIN_MULTIPLIER: "2.0",
      STAT_LEADER_BONUS_ENABLED: "true",
      STAT_LEADER_BONUS_POINTS: "2",
      STAT_LEADER_MALUS_POINTS: "2",
    };
    const cfg = parseScoringConfig(raw);
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it("CAPTAIN_MULTIPLIER manquant → défaut 2.0", () => {
    expect(parseScoringConfig({}).captainMultiplier).toBe(2.0);
  });

  it("clés STAT_LEADER_* manquantes → défauts (enabled=true, bonus=2, malus=2)", () => {
    const cfg = parseScoringConfig({});
    expect(cfg.statLeaderBonusEnabled).toBe(true);
    expect(cfg.statLeaderBonusPoints).toBe(2);
    expect(cfg.statLeaderMalusPoints).toBe(2);
  });

  it("STAT_LEADER_BONUS_ENABLED=false désactive le mécanisme", () => {
    expect(parseScoringConfig({ STAT_LEADER_BONUS_ENABLED: "false" }).statLeaderBonusEnabled).toBe(false);
  });

  it("TRIPLE_CAPTAIN_MULTIPLIER / BENCH_BOOST_MULTIPLIER manquants → défauts 3.0 / 1.0", () => {
    const cfg = parseScoringConfig({});
    expect(cfg.tripleCaptainMultiplier).toBe(3.0);
    expect(cfg.benchBoostMultiplier).toBe(1.0);
  });

  it("STAT_BONUS_MULTIPLIER / STATISTICIAN_MULTIPLIER manquants → défauts 1.0 / 2.0", () => {
    const cfg = parseScoringConfig({});
    expect(cfg.statBonusMultiplier).toBe(1.0);
    expect(cfg.statisticianMultiplier).toBe(2.0);
  });

  it("les overrides ont priorité", () => {
    const cfg = parseScoringConfig({}, { ratingBaseline: 6 });
    expect(cfg.ratingBaseline).toBe(6);
  });
});
