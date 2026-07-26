import { describe, it, expect } from "vitest";
import { predictionLockAt, isMatchLocked } from "./lock";

describe("predictionLockAt", () => {
  it("recule le coup d'envoi du nombre de minutes donné", () => {
    const kickoff = new Date("2026-09-04T20:00:00.000Z");
    expect(predictionLockAt(kickoff, 5)).toEqual(new Date("2026-09-04T19:55:00.000Z"));
  });
});

describe("isMatchLocked", () => {
  const kickoff = new Date("2026-09-04T20:00:00.000Z");

  it("pas encore verrouillé avant la fenêtre de blocage", () => {
    expect(isMatchLocked(kickoff, 5, new Date("2026-09-04T19:54:59.000Z"))).toBe(false);
  });

  it("verrouillé pile à l'entrée dans la fenêtre", () => {
    expect(isMatchLocked(kickoff, 5, new Date("2026-09-04T19:55:00.000Z"))).toBe(true);
  });

  it("verrouillé après le coup d'envoi", () => {
    expect(isMatchLocked(kickoff, 5, new Date("2026-09-04T20:01:00.000Z"))).toBe(true);
  });
});
