import { describe, it, expect } from "vitest";
import { isLineupEditLocked } from "./deadline";

describe("isLineupEditLocked", () => {
  it("live + journée active non scorée → verrouillé", () => {
    expect(isLineupEditLocked("live", true)).toBe(true);
  });

  it("live + pas de journée active → déverrouillé", () => {
    expect(isLineupEditLocked("live", false)).toBe(false);
  });

  it("simulation → jamais verrouillé, même avec une journée active", () => {
    expect(isLineupEditLocked("simulation", true)).toBe(false);
  });
});
