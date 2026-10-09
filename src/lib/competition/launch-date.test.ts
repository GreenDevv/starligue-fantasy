import { describe, it, expect } from "vitest";
import { formatLaunchDate, launchMoment, isComingSoon } from "./launch-date";

describe("formatLaunchDate", () => {
  it("ISO → JJ.MM.AA", () => {
    expect(formatLaunchDate("2026-10-10")).toBe("10.10.26");
    expect(formatLaunchDate(" 2027-01-05 ")).toBe("05.01.27");
  });

  it("absente, mal formée ou impossible → null (badge « BIENTÔT » conservé)", () => {
    expect(formatLaunchDate(undefined)).toBeNull();
    expect(formatLaunchDate("")).toBeNull();
    expect(formatLaunchDate("10/10/2026")).toBeNull();
    expect(formatLaunchDate("2026-02-30")).toBeNull();
  });
});

describe("launchMoment", () => {
  it("jour J à 06:00 UTC (08:00 Paris) par défaut", () => {
    expect(launchMoment("2026-10-10", undefined)?.toISOString()).toBe("2026-10-10T06:00:00.000Z");
  });
  it("LAUNCH_AT prioritaire", () => {
    expect(launchMoment("2026-10-10", "2026-10-09T22:00:00Z")?.toISOString()).toBe("2026-10-09T22:00:00.000Z");
  });
  it("LAUNCH_AT illisible → date du jour J ; rien de lisible → null", () => {
    expect(launchMoment("2026-10-10", "demain")?.toISOString()).toBe("2026-10-10T06:00:00.000Z");
    expect(launchMoment(undefined, undefined)).toBeNull();
  });
});

describe("isComingSoon", () => {
  const base = { comingSoon: "true", launchDate: "2026-10-10", launchAt: undefined };
  it("avant l'ouverture → oui, à l'instant d'ouverture → non", () => {
    expect(isComingSoon({ ...base, now: new Date("2026-10-10T05:59:59Z") })).toBe(true);
    expect(isComingSoon({ ...base, now: new Date("2026-10-10T06:00:00Z") })).toBe(false);
  });
  it("COMING_SOON absent → jamais", () => {
    expect(isComingSoon({ ...base, comingSoon: undefined, now: new Date("2026-01-01") })).toBe(false);
  });
  it("sans date de lancement → reste « bientôt »", () => {
    expect(isComingSoon({ ...base, launchDate: undefined, now: new Date("2030-01-01") })).toBe(true);
  });
});
