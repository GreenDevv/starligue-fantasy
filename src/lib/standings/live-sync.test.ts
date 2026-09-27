import { describe, it, expect } from "vitest";
import { standingsFitGameweek } from "./live-sync";

describe("standingsFitGameweek", () => {
  it("accepte un classement à jour de la journée (ou en retard : match reporté)", () => {
    expect(standingsFitGameweek([{ played: 3 }, { played: 3 }, { played: 2 }], 3)).toBe(true);
  });

  it("refuse un classement qui compte déjà un match de la journée suivante (SRVH–SARAN J4 dans l'instantané J3)", () => {
    expect(standingsFitGameweek([{ played: 3 }, { played: 4 }], 3)).toBe(false);
  });
});
