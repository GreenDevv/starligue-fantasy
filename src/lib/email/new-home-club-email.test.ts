import { describe, it, expect } from "vitest";
import { buildNewHomeClubEmail } from "./new-home-club-email";

describe("buildNewHomeClubEmail", () => {
  const base = {
    clubName: "NYCTHC The World's Handball Club",
    city: "New York City",
    country: "US",
    memberName: "Martin",
    verifyUrl: "https://starliguefantasy.fr/api/admin/handball-clubs/action?token=VVV",
    rejectUrl: "https://starliguefantasy.fr/api/admin/handball-clubs/action?token=RRR",
    adminUrl: "https://starliguefantasy.fr/fr/admin/handball-clubs",
  };

  it("met le club dans le sujet et les 3 liens dans le corps", () => {
    const { subject, html } = buildNewHomeClubEmail(base);
    expect(subject).toBe("Nouveau club à valider : NYCTHC The World's Handball Club");
    expect(html).toContain("token=VVV");
    expect(html).toContain("token=RRR");
    expect(html).toContain("/fr/admin/handball-clubs");
    expect(html).toContain("New York City");
    expect(html).toContain("Martin");
  });

  it("échappe le HTML du nom de club et du membre (saisie utilisateur)", () => {
    const { subject, html } = buildNewHomeClubEmail({
      ...base,
      clubName: "<script>x</script> & Co",
      memberName: "<b>bob</b>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bob&lt;/b&gt;");
    expect(subject).toContain("<script>x</script> & Co"); // sujet = texte brut, voulu
  });

  it("gère une ville absente", () => {
    const { html } = buildNewHomeClubEmail({ ...base, city: null });
    expect(html).toContain("NYCTHC");
  });
});
