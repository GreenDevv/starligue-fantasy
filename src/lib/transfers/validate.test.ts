import { describe, it, expect } from "vitest";
import { validateTransfer } from "./validate";
import type { SquadPlayer } from "@/lib/squad/validation";

function makeSquad(): SquadPlayer[] {
  return [
    { id: "gk-1", position: "GK", marketValue: 10, isActive: true },
    { id: "gk-2", position: "GK", marketValue: 8, isActive: true },
    { id: "lw-1", position: "LW", marketValue: 9, isActive: true },
    { id: "lw-2", position: "LW", marketValue: 7, isActive: true },
  ];
}

describe("validateTransfer", () => {
  it("échange valide au même poste, budget suffisant → valid", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-2",
      buyPlayer: { id: "gk-3", position: "GK", marketValue: 8, isActive: true },
      budget: 5,
    });
    expect(result.valid).toBe(true);
    expect(result.newBudget).toBe(5); // 5 + 8 - 8
  });

  it("joueur vendu absent de l'effectif → PLAYER_NOT_IN_SQUAD", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "unknown",
      buyPlayer: { id: "gk-3", position: "GK", marketValue: 8, isActive: true },
      budget: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "PLAYER_NOT_IN_SQUAD")).toBe(true);
  });

  it("joueur acheté déjà dans l'effectif → PLAYER_ALREADY_IN_SQUAD", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-2",
      buyPlayer: { id: "gk-1", position: "GK", marketValue: 8, isActive: true },
      budget: 5,
    });
    expect(result.errors.some((e) => e.code === "PLAYER_ALREADY_IN_SQUAD")).toBe(true);
  });

  it("poste différent → POSITION_MISMATCH", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-2",
      buyPlayer: { id: "lw-3", position: "LW", marketValue: 8, isActive: true },
      budget: 5,
    });
    expect(result.errors.some((e) => e.code === "POSITION_MISMATCH")).toBe(true);
  });

  it("joueur acheté inactif (blessé/parti) → INACTIVE_PLAYER", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-2",
      buyPlayer: { id: "gk-3", position: "GK", marketValue: 8, isActive: false },
      budget: 5,
    });
    expect(result.errors.some((e) => e.code === "INACTIVE_PLAYER")).toBe(true);
  });

  it("budget insuffisant après échange → BUDGET_EXCEEDED avec le manque exact", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-2",
      buyPlayer: { id: "gk-3", position: "GK", marketValue: 15, isActive: true },
      budget: 1,
    });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "BUDGET_EXCEEDED");
    expect(err).toMatchObject({ code: "BUDGET_EXCEEDED", shortfall: 6 }); // 1 + 8 - 15 = -6
  });

  it("vendre un joueur pour un moins cher augmente le budget restant", () => {
    const result = validateTransfer({
      squad: makeSquad(),
      sellPlayerId: "gk-1",
      buyPlayer: { id: "gk-3", position: "GK", marketValue: 4, isActive: true },
      budget: 0,
    });
    expect(result.valid).toBe(true);
    expect(result.newBudget).toBe(6); // 0 + 10 - 4
  });
});
