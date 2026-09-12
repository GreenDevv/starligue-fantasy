import { describe, it, expect } from "vitest";
import { matchOutcomeForTeam } from "./match-outcome";

describe("matchOutcomeForTeam", () => {
  it("victoire à domicile", () => {
    expect(matchOutcomeForTeam(true, 30, 25, "FINISHED")).toBe("V");
  });

  it("défaite à l'extérieur (l'adversaire gagne à domicile)", () => {
    expect(matchOutcomeForTeam(false, 30, 25, "FINISHED")).toBe("D");
  });

  it("victoire à l'extérieur", () => {
    expect(matchOutcomeForTeam(false, 20, 25, "FINISHED")).toBe("V");
  });

  it("nul", () => {
    expect(matchOutcomeForTeam(true, 28, 28, "FINISHED")).toBe("N");
  });

  it("null si le match n'est pas terminé", () => {
    expect(matchOutcomeForTeam(true, 15, 12, "LIVE")).toBeNull();
    expect(matchOutcomeForTeam(true, 0, 0, "SCHEDULED")).toBeNull();
  });

  it("null si un score manque", () => {
    expect(matchOutcomeForTeam(true, null, null, "FINISHED")).toBeNull();
  });
});
