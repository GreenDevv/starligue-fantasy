import { describe, it, expect } from "vitest";
import { buildStatLeadersCaption } from "./stat-leaders-caption";

describe("buildStatLeadersCaption", () => {
  it("inclut le numéro de journée et les hashtags de marque pour chaque thème", () => {
    for (const kind of ["attack", "goalkeepers", "defense"] as const) {
      const caption = buildStatLeadersCaption(kind, 12);
      expect(caption).toContain("Journée 12");
      expect(caption).toContain("#StarligueFantasy");
      expect(caption).toContain("#DaikinStarLigue");
      expect(caption.length).toBeLessThanOrEqual(2200);
    }
  });

  it("un thème différent produit une légende différente", () => {
    const attack = buildStatLeadersCaption("attack", 5);
    const goalkeepers = buildStatLeadersCaption("goalkeepers", 5);
    const defense = buildStatLeadersCaption("defense", 5);
    expect(new Set([attack, goalkeepers, defense]).size).toBe(3);
  });
});
