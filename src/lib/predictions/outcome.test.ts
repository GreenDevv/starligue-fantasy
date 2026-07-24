import { describe, it, expect } from "vitest";
import { resolveOutcome } from "./outcome";

describe("resolveOutcome", () => {
  it("domicile gagne → HOME", () => {
    expect(resolveOutcome(30, 25)).toBe("HOME");
    expect(resolveOutcome(28, 27)).toBe("HOME");
  });

  it("match nul → DRAW", () => {
    expect(resolveOutcome(28, 28)).toBe("DRAW");
  });

  it("extérieur gagne → AWAY", () => {
    expect(resolveOutcome(27, 28)).toBe("AWAY");
    expect(resolveOutcome(20, 25)).toBe("AWAY");
  });
});
