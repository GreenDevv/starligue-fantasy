import { describe, it, expect } from "vitest";
import { homeClubInputSchema } from "./home-club-input";

describe("homeClubInputSchema", () => {
  it("accepte un club de l'annuaire", () => {
    const r = homeClubInputSchema.safeParse({ clubId: "abc123" });
    expect(r.success).toBe(true);
  });

  it("accepte une saisie libre et met le pays en majuscules", () => {
    const r = homeClubInputSchema.safeParse({ newClub: { name: "  HBC Trifouillis  ", country: "fr" } });
    expect(r.success).toBe(true);
    if (r.success && r.data && "newClub" in r.data) {
      expect(r.data.newClub.name).toBe("HBC Trifouillis"); // trim
      expect(r.data.newClub.country).toBe("FR");
    }
  });

  it("accepte null (retrait du club)", () => {
    expect(homeClubInputSchema.safeParse(null).success).toBe(true);
  });

  it("rejette un pays inconnu", () => {
    expect(homeClubInputSchema.safeParse({ newClub: { name: "X Club", country: "ZZ" } }).success).toBe(false);
  });

  it("rejette un nom trop court", () => {
    expect(homeClubInputSchema.safeParse({ newClub: { name: "A", country: "FR" } }).success).toBe(false);
  });

  it("rejette un objet vide / une forme inconnue", () => {
    expect(homeClubInputSchema.safeParse({}).success).toBe(false);
    expect(homeClubInputSchema.safeParse({ foo: "bar" }).success).toBe(false);
  });
});
