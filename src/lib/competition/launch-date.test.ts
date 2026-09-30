import { describe, it, expect } from "vitest";
import { formatLaunchDate } from "./launch-date";

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
