import { describe, expect, it } from "vitest";
import {
  RESET_TOKEN_TTL_MINUTES,
  computeResetTokenExpiry,
  hashResetToken,
  isResetTokenExpired,
} from "./password-reset";

describe("hashResetToken", () => {
  it("est déterministe pour un même token", () => {
    expect(hashResetToken("abc123")).toBe(hashResetToken("abc123"));
  });

  it("produit des hash différents pour des tokens différents", () => {
    expect(hashResetToken("abc123")).not.toBe(hashResetToken("abc124"));
  });

  it("produit un hex sha256 (64 caractères)", () => {
    expect(hashResetToken("abc123")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeResetTokenExpiry", () => {
  it("ajoute RESET_TOKEN_TTL_MINUTES à la date fournie", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const expiry = computeResetTokenExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(RESET_TOKEN_TTL_MINUTES * 60_000);
  });
});

describe("isResetTokenExpired", () => {
  it("n'est pas expiré juste avant l'échéance", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const expiresAt = new Date(now.getTime() + 1000);
    expect(isResetTokenExpired(expiresAt, now)).toBe(false);
  });

  it("est expiré exactement à l'échéance", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    expect(isResetTokenExpired(now, now)).toBe(true);
  });

  it("est expiré après l'échéance", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const expiresAt = new Date(now.getTime() - 1000);
    expect(isResetTokenExpired(expiresAt, now)).toBe(true);
  });
});
