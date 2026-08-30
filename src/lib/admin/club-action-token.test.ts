import { describe, it, expect, beforeAll } from "vitest";
import {
  signClubActionToken,
  verifyClubActionToken,
  CLUB_ACTION_TOKEN_TTL_MS,
} from "./club-action-token";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-value-123";
});

describe("club-action-token", () => {
  it("round-trip : un jeton signé se revérifie", () => {
    const t = signClubActionToken("club_abc", "verify");
    expect(verifyClubActionToken(t)).toEqual({ clubId: "club_abc", action: "verify" });
  });

  it("distingue verify et reject", () => {
    expect(verifyClubActionToken(signClubActionToken("c", "reject"))?.action).toBe("reject");
  });

  it("rejette une signature altérée", () => {
    const t = signClubActionToken("club_abc", "verify");
    const tampered = t.slice(0, -2) + (t.endsWith("aa") ? "bb" : "aa");
    expect(verifyClubActionToken(tampered)).toBeNull();
  });

  it("rejette un payload altéré (clubId changé)", () => {
    const [, sig] = signClubActionToken("club_abc", "verify").split(".");
    const fakePayload = Buffer.from(JSON.stringify({ c: "club_evil", a: "verify", e: Date.now() + 1e6 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyClubActionToken(`${fakePayload}.${sig}`)).toBeNull();
  });

  it("rejette un jeton expiré", () => {
    const past = Date.now() - CLUB_ACTION_TOKEN_TTL_MS - 1000;
    expect(verifyClubActionToken(signClubActionToken("c", "verify", past))).toBeNull();
  });

  it("rejette une forme invalide", () => {
    expect(verifyClubActionToken("")).toBeNull();
    expect(verifyClubActionToken("nope")).toBeNull();
    expect(verifyClubActionToken("a.b.c")).toBeNull();
  });
});
