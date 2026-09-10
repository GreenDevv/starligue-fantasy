import { describe, it, expect } from "vitest";
import { buildAdminCorrectionRecapEmail } from "./admin-recap-email";

describe("buildAdminCorrectionRecapEmail", () => {
  it("résume les lots et pointe vers l'écran admin", () => {
    const { subject, html } = buildAdminCorrectionRecapEmail({
      batches: [
        {
          gameweekNumber: 3,
          correctionCount: 4,
          impactedTeams: 6,
          ratingCorrections: 3,
          topDeltas: [
            { teamName: "Les Experts", delta: 2.8 },
            { teamName: "Dream Team", delta: -1.5 },
          ],
        },
      ],
      adminUrl: "https://x.fr/fr/admin/lnh-corrections",
    });
    expect(subject).toContain("J3");
    expect(subject).toContain("6 manager");
    expect(html).toContain("4 correction(s) appliquée(s)");
    expect(html).toContain("Les Experts");
    expect(html).toContain("+2,8");
    expect(html).toContain("−1,5");
    expect(html).toContain("https://x.fr/fr/admin/lnh-corrections");
    expect(html).toContain("n'ont pas encore été prévenus");
  });

  it("liste plusieurs journées", () => {
    const { subject } = buildAdminCorrectionRecapEmail({
      batches: [
        { gameweekNumber: 2, correctionCount: 1, impactedTeams: 1, ratingCorrections: 1, topDeltas: [] },
        { gameweekNumber: 3, correctionCount: 2, impactedTeams: 3, ratingCorrections: 2, topDeltas: [] },
      ],
      adminUrl: "https://x.fr",
    });
    expect(subject).toContain("J2, J3");
    expect(subject).toContain("4 manager");
  });
});
