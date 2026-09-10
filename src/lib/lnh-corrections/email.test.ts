import { describe, it, expect } from "vitest";
import { buildLnhCorrectionEmail, type TeamImpactForEmail } from "./email";

function team(over: Partial<TeamImpactForEmail> = {}): TeamImpactForEmail {
  return {
    teamName: "Les Experts",
    leagueName: "Ligue des potes",
    pointsBefore: 42.4,
    pointsAfter: 45.2,
    delta: 2.8,
    globalRankBefore: 8,
    globalRankAfter: 5,
    leagueRankBefore: 3,
    leagueRankAfter: 2,
    directCorrections: [
      { playerId: "p1", playerName: "GNAGO Adam", club: "CAEN", ratingBefore: 19.1, ratingAfter: 19.4, ratingChanged: true, otherFieldCount: 2 },
    ],
    indirect: false,
    ...over,
  };
}

describe("buildLnhCorrectionEmail", () => {
  it("cas direct, une équipe : sujet + avant/après + joueur + rangs", () => {
    const { subject, html } = buildLnhCorrectionEmail({
      gameweekNumber: 1,
      teams: [team()],
      recapUrl: "https://x.fr/fr/team",
    });
    expect(subject).toContain("J1");
    expect(subject).toContain("+2,8");
    expect(html).toContain("GNAGO Adam");
    expect(html).toContain("19,1 → <strong>19,4</strong>");
    expect(html).toContain("42,4 → 45,2");
    expect(html).toContain("8ᵉ → <strong>5ᵉ</strong>");
    expect(html).toContain("https://x.fr/fr/team");
  });

  it("cas indirect : wording générique, pas de liste de joueurs", () => {
    const { html } = buildLnhCorrectionEmail({
      gameweekNumber: 3,
      teams: [team({ indirect: true, directCorrections: [], delta: -1 })],
      recapUrl: "https://x.fr",
    });
    expect(html).toContain("leaders de journée");
    expect(html).not.toContain("GNAGO");
  });

  it("échappe le nom d'équipe (texte utilisateur)", () => {
    const { html } = buildLnhCorrectionEmail({
      gameweekNumber: 1,
      teams: [team({ teamName: "<script>x</script>" })],
      recapUrl: "https://x.fr",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("plusieurs équipes : sujet neutre, un bloc par équipe", () => {
    const { subject, html } = buildLnhCorrectionEmail({
      gameweekNumber: 2,
      teams: [team({ teamName: "Equipe A" }), team({ teamName: "Equipe B", delta: -3 })],
      recapUrl: "https://x.fr",
    });
    expect(subject).toContain("ajustés");
    expect(html).toContain("Equipe A");
    expect(html).toContain("Equipe B");
  });
});
