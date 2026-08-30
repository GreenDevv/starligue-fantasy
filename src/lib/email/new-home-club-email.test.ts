import { describe, it, expect } from "vitest";
import { buildNewHomeClubEmail } from "./new-home-club-email";

describe("buildNewHomeClubEmail", () => {
  const base = {
    clubName: "NYCTHC The World's Handball Club",
    city: "New York City",
    country: "US",
    memberName: "Martin",
    adminUrl: "https://starliguefantasy.fr/fr/admin/handball-clubs",
  };

  it("met le club dans le sujet et le lien admin dans le CTA", () => {
    const { subject, html } = buildNewHomeClubEmail(base);
    expect(subject).toBe("Nouveau club à valider : NYCTHC The World's Handball Club");
    expect(html).toContain("https://starliguefantasy.fr/fr/admin/handball-clubs");
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
    // le sujet est du texte brut (pas de HTML) → non échappé, c'est voulu
    expect(subject).toContain("<script>x</script> & Co");
  });

  it("gère une ville absente", () => {
    const { html } = buildNewHomeClubEmail({ ...base, city: null });
    expect(html).toContain("NYCTHC");
  });
});
