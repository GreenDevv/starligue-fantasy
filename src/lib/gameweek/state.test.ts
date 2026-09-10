import { describe, it, expect } from "vitest";
import { getGameweekState } from "./state";

const H = 3_600_000;
const base = {
  deadlineAt: new Date("2026-09-12T18:00:00Z"),
  isScored: false,
  confirmedAt: null,
  now: new Date("2026-09-12T12:00:00Z"),
};

describe("getGameweekState", () => {
  it("deadline dans le futur → UPCOMING (neutre)", () => {
    const r = getGameweekState({ ...base, matchStatuses: ["SCHEDULED", "SCHEDULED"] });
    expect(r.state).toBe("UPCOMING");
    expect(r.tone).toBe("neutral");
    expect(r.pointsMayChange).toBe(false);
  });

  it("deadline passée, un match en cours → LIVE (danger)", () => {
    const r = getGameweekState({
      ...base,
      now: new Date(base.deadlineAt.getTime() + 2 * H),
      matchStatuses: ["FINISHED", "LIVE", "SCHEDULED"],
    });
    expect(r.state).toBe("LIVE");
    expect(r.tone).toBe("danger");
    expect(r.anyMatchLive).toBe(true);
    expect(r.matchesFinished).toBe(1);
    expect(r.pointsMayChange).toBe(true);
  });

  it("tous les matchs terminés mais pas encore scoré → AWAITING_RESULTS", () => {
    const r = getGameweekState({
      ...base,
      now: new Date(base.deadlineAt.getTime() + 24 * H),
      matchStatuses: ["FINISHED", "FINISHED", "FINISHED"],
    });
    expect(r.state).toBe("AWAITING_RESULTS");
    expect(r.tone).toBe("attention");
    expect(r.allMatchesSettled).toBe(true);
  });

  it("un match reporté n'empêche pas AWAITING_RESULTS", () => {
    const r = getGameweekState({
      ...base,
      now: new Date(base.deadlineAt.getTime() + 24 * H),
      matchStatuses: ["FINISHED", "POSTPONED"],
    });
    expect(r.state).toBe("AWAITING_RESULTS");
  });

  it("scoré mais non confirmé → PROVISIONAL", () => {
    const r = getGameweekState({
      ...base,
      isScored: true,
      now: new Date(base.deadlineAt.getTime() + 48 * H),
      matchStatuses: ["FINISHED", "FINISHED"],
    });
    expect(r.state).toBe("PROVISIONAL");
    expect(r.tone).toBe("attention");
    expect(r.pointsMayChange).toBe(true);
  });

  it("confirmedAt posé → CONFIRMED, même avec un statut de match incohérent", () => {
    const r = getGameweekState({
      ...base,
      isScored: true,
      confirmedAt: new Date(base.deadlineAt.getTime() + 60 * H),
      now: new Date(base.deadlineAt.getTime() + 90 * H),
      matchStatuses: ["FINISHED", "LIVE"],
    });
    expect(r.state).toBe("CONFIRMED");
    expect(r.tone).toBe("confirmed");
    expect(r.pointsMayChange).toBe(false);
  });

  it("confirmedAt gagne sur isScored=false (garde-fou)", () => {
    const r = getGameweekState({ ...base, confirmedAt: new Date(), matchStatuses: [] });
    expect(r.state).toBe("CONFIRMED");
  });
});
