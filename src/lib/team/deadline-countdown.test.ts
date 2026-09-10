import { describe, it, expect } from "vitest";
import { deadlineTier, formatCountdown } from "./deadline-countdown";

const H = 3_600_000;

describe("deadlineTier", () => {
  it("≥ 24h → calm", () => {
    expect(deadlineTier(48 * H)).toBe("calm");
    expect(deadlineTier(24 * H)).toBe("calm");
  });

  it("< 24h et ≥ 2h → amber", () => {
    expect(deadlineTier(24 * H - 1)).toBe("amber");
    expect(deadlineTier(2 * H)).toBe("amber");
  });

  it("< 2h → red", () => {
    expect(deadlineTier(2 * H - 1)).toBe("red");
    expect(deadlineTier(0)).toBe("red");
  });
});

describe("formatCountdown", () => {
  it("≥ 48h → jours + heures + minutes", () => {
    expect(formatCountdown(50 * H + 30 * 60_000)).toBe("2j 2h30");
  });

  it("< 48h → HH:MM:SS zéro-paddé", () => {
    expect(formatCountdown(3 * H + 5 * 60_000 + 9_000)).toBe("03:05:09");
  });

  it("temps écoulé → 0:00:00", () => {
    expect(formatCountdown(0)).toBe("0:00:00");
    expect(formatCountdown(-1000)).toBe("0:00:00");
  });
});
