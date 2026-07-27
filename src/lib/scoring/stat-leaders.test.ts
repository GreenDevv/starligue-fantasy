import { describe, it, expect } from "vitest";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "./stat-leaders";

const CONFIG = { enabled: true, bonusPoints: 2, malusPoints: 2 };

function player(id: string, overrides: Partial<StatLeaderPlayerInput> = {}): StatLeaderPlayerInput {
  return {
    playerId: id,
    played: true,
    goalsPlay: null,
    goalsPenalty: null,
    goalsTotal: null,
    shotPercentage: null,
    assists: null,
    ballsRecovered: null,
    opponentShotsBlocked: null,
    penaltiesDrawn: null,
    twoMinDrawn: null,
    neutralizations: null,
    saves: null,
    savePercentage: null,
    turnovers: null,
    twoMinTaken: null,
    disqualified: null,
    ...overrides,
  };
}

describe("computeStatLeaderBonuses", () => {
  it("désactivé → aucune bonus/malus", () => {
    const rows = [player("a", { goalsTotal: 10 })];
    expect(computeStatLeaderBonuses(rows, { ...CONFIG, enabled: false }).size).toBe(0);
  });

  it("seul leader d'une ligne bonus reçoit +bonusPoints", () => {
    const rows = [player("a", { goalsTotal: 10 }), player("b", { goalsTotal: 3 })];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(2);
    expect(bonuses.has("b")).toBe(false);
  });

  it("égalité sur le max → tous les leaders reçoivent le bonus", () => {
    const rows = [
      player("a", { assists: 5 }),
      player("b", { assists: 5 }),
      player("c", { assists: 1 }),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(2);
    expect(bonuses.get("b")).toBe(2);
    expect(bonuses.has("c")).toBe(false);
  });

  it("ligne malus (turnovers) → le leader reçoit -malusPoints", () => {
    const rows = [player("a", { turnovers: 6 }), player("b", { turnovers: 1 })];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(-2);
    expect(bonuses.has("b")).toBe(false);
  });

  it("disqualified (0/1) → tous les disqualifiés reçoivent le malus", () => {
    const rows = [
      player("a", { disqualified: 1 }),
      player("b", { disqualified: 1 }),
      player("c", { disqualified: 0 }),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(-2);
    expect(bonuses.get("b")).toBe(-2);
    expect(bonuses.has("c")).toBe(false);
  });

  it("max <= 0 → catégorie ignorée (pas de leader significatif)", () => {
    const rows = [player("a", { goalsTotal: 0 }), player("b", { goalsTotal: 0 })];
    expect(computeStatLeaderBonuses(rows, CONFIG).size).toBe(0);
  });

  it("valeurs null (ex: gardien sans colonne buts) exclues du calcul du max", () => {
    const rows = [
      player("gk", { goalsTotal: null }),
      player("a", { goalsTotal: 4 }),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(2);
    expect(bonuses.has("gk")).toBe(false);
  });

  it("joueur n'ayant pas joué exclu, même avec une valeur élevée", () => {
    const rows = [
      player("bench", { played: false, goalsTotal: 10 }),
      player("a", { goalsTotal: 3 }),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(2);
    expect(bonuses.has("bench")).toBe(false);
  });

  it("un joueur cumule plusieurs lignes le même jour", () => {
    const rows = [
      player("a", { goalsTotal: 10, assists: 8 }),
      player("b", { goalsTotal: 2, assists: 1 }),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("a")).toBe(4);
  });

  it("aucune ligne → Map vide", () => {
    expect(computeStatLeaderBonuses([], CONFIG).size).toBe(0);
  });

  it("gardien leader sur les arrêts reçoit le bonus, joueurs de champ (saves null) exclus", () => {
    const rows = [
      player("gk-a", { saves: 12, savePercentage: 60 }),
      player("gk-b", { saves: 7, savePercentage: 40 }),
      player("field"),
    ];
    const bonuses = computeStatLeaderBonuses(rows, CONFIG);
    expect(bonuses.get("gk-a")).toBe(4); // leader sur saves ET savePercentage
    expect(bonuses.has("gk-b")).toBe(false);
    expect(bonuses.has("field")).toBe(false);
  });
});
