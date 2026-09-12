import { describe, it, expect } from "vitest";
import { hasPendingMatchThisRound } from "./pending-match";

describe("hasPendingMatchThisRound", () => {
  it("false si aucune journée de référence (aucun snapshot encore)", () => {
    expect(hasPendingMatchThisRound(0, null)).toBe(false);
  });

  it("true si le club a joué un match de moins que le numéro de la journée en cours", () => {
    expect(hasPendingMatchThisRound(4, 5)).toBe(true);
  });

  it("false si le club a déjà joué la journée en cours", () => {
    expect(hasPendingMatchThisRound(5, 5)).toBe(false);
  });

  it("false si le club a même joué plus de matchs (ne devrait pas arriver, mais pas de faux positif)", () => {
    expect(hasPendingMatchThisRound(6, 5)).toBe(false);
  });
});
