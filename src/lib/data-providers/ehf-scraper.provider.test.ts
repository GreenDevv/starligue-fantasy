import { describe, it, expect } from "vitest";
import { mapEhfMatch, parseClubLogosFromHtml, EHF_CHAMPIONS_LEAGUE_LABEL, type EhfMatch } from "./ehf-scraper.provider";

// Échantillon représentatif des 18 clubs Starligue (slug lnh.fr + nom complet) —
// mêmes valeurs que celles renvoyées par getActiveClubSlugsAndNames en prod.
const KNOWN_CLUBS = [
  { slug: "nantes", name: "HBC Nantes" },
  { slug: "montpellier", name: "Montpellier Handball" },
  { slug: "paris", name: "Paris Saint-Germain Handball" },
  { slug: "toulouse", name: "Fenix Toulouse Handball" },
  { slug: "saint-raphael", name: "Saint-Raphaël Var Handball" },
];

// Fidèle au sous-ensemble de champs réellement consommé (voir EhfMatchSchema),
// capturé le 2026-08-02 sur l'API umbraco/api/competitionmatchesapi.
function match(opts: {
  id?: string;
  utc?: string;
  homeName: string;
  homeNation?: string | null;
  homeLogoBig?: string | null;
  homeLogoSmall?: string | null;
  homeGoals?: number | null;
  awayName: string;
  awayNation?: string | null;
  awayGoals?: number | null;
}): EhfMatch {
  return {
    matchID: opts.id ?? "202711020101015",
    venue: { date: { utc: opts.utc ?? "2026-09-09T18:45:00Z" } },
    homeTeam: {
      team: {
        name: opts.homeName,
        nationAbbreviation: opts.homeNation ?? null,
        logoBig: opts.homeLogoBig ?? null,
        logoSmall: opts.homeLogoSmall ?? null,
      },
      score: { goals: opts.homeGoals ?? null },
    },
    guestTeam: {
      team: {
        name: opts.awayName,
        nationAbbreviation: opts.awayNation ?? null,
        logoBig: null,
        logoSmall: null,
      },
      score: { goals: opts.awayGoals ?? null },
    },
  };
}

function map(opts: Parameters<typeof match>[0]) {
  return mapEhfMatch(match(opts), EHF_CHAMPIONS_LEAGUE_LABEL, KNOWN_CLUBS);
}

describe("mapEhfMatch", () => {
  it("résout le slug lnh.fr d'un club Starligue engagé (HBC Nantes, nom identique)", () => {
    const m = map({ homeName: "HBC Nantes", homeNation: "FRA", awayName: "Orlen Wisla Plock", awayNation: "POL" });
    expect(m.homeClubSlug).toBe("nantes");
    expect(m.homeClubDivision).toBe("FRA");
  });

  it("résout un club dont le nom EHF omet le suffixe présent en DB (Paris Saint-Germain)", () => {
    const m = map({ homeName: "Paris Saint-Germain", awayName: "X" });
    expect(m.homeClubSlug).toBe("paris");
  });

  it("résout un club dont le nom EHF n'a pas d'accent (Saint-Raphael Var Handball)", () => {
    const m = map({ homeName: "HBC Nantes", awayName: "Saint-Raphael Var Handball" });
    expect(m.awayClubSlug).toBe("saint-raphael");
  });

  it("résout un club dont le nom EHF omet le suffixe ET la DB le porte (Fenix Toulouse)", () => {
    const m = map({ homeName: "HBC Nantes", awayName: "Fenix Toulouse" });
    expect(m.awayClubSlug).toBe("toulouse");
  });

  it("dérive un slug lisible pour un club étranger inconnu, en retirant les accents", () => {
    const m = map({ homeName: "HBC Nantes", awayName: "RK Celje Pivovarna Laško", awayNation: "SLO" });
    expect(m.awayClubSlug).toBe("rk-celje-pivovarna-lasko");
    expect(m.awayClubDivision).toBe("SLO");
  });

  it("match non joué : statut SCHEDULED, scores null", () => {
    const m = map({ homeName: "HBC Nantes", awayName: "Orlen Wisla Plock", homeGoals: null, awayGoals: null });
    expect(m.status).toBe("SCHEDULED");
    expect(m.homeScore).toBeNull();
    expect(m.awayScore).toBeNull();
  });

  it("match joué : statut FINISHED, scores renseignés", () => {
    const m = map({ homeName: "HBC Nantes", awayName: "Orlen Wisla Plock", homeGoals: 30, awayGoals: 25 });
    expect(m.status).toBe("FINISHED");
    expect(m.homeScore).toBe(30);
    expect(m.awayScore).toBe(25);
  });

  it("logo : logoBig prioritaire sur logoSmall, chaîne vide si aucun des deux", () => {
    const withBig = map({ homeName: "HBC Nantes", awayName: "X", homeLogoBig: "https://big.png", homeLogoSmall: "https://small.png" });
    expect(withBig.homeClubLogoUrl).toBe("https://big.png");

    const withSmallOnly = map({ homeName: "HBC Nantes", awayName: "X", homeLogoBig: null, homeLogoSmall: "https://small.png" });
    expect(withSmallOnly.homeClubLogoUrl).toBe("https://small.png");

    const withNeither = map({ homeName: "HBC Nantes", awayName: "X", homeLogoBig: null, homeLogoSmall: null });
    expect(withNeither.homeClubLogoUrl).toBe("");
  });

  it("conserve l'id du match comme calendarsId et la date UTC comme kickoffAt", () => {
    const m = map({ id: "202711020101099", utc: "2026-10-07T18:45:00Z", homeName: "Paris Saint-Germain", awayName: "X" });
    expect(m.calendarsId).toBe("202711020101099");
    expect(m.kickoffAt.toISOString()).toBe("2026-10-07T18:45:00.000Z");
  });

  it("étiquette la compétition passée en paramètre (générique, pas figée)", () => {
    const m = mapEhfMatch(match({ homeName: "HBC Nantes", awayName: "X" }), "EHF European League", KNOWN_CLUBS);
    expect(m.competitionLabel).toBe("EHF European League");
  });
});

// Fragment fidèle à la structure réelle capturée le 2026-08-02 sur
// ehfcl.eurohandball.com/men/2026-27/clubs/ (bloc `class="tg-item"`, logo en
// data-src car chargement différé côté site, nom encodé en entités HTML).
function clubItem(opts: { name: string; nation: string; logoUrl: string }): string {
  return `
<a href="http://history.eurohandball.com/redirect/club/x" class="tg-item" title="${opts.name} (${opts.nation})">
    <img class="tg-flag"
         data-loading="lazy"
         src="/frontend.kw/dist/assets/img/blank.png"
         data-src="${opts.logoUrl}"
         alt="${opts.name} (${opts.nation})">
  <span class="tg-name">${opts.name}</span>
  <span class="tg-abbreviation">${opts.nation}</span>
</a>
`;
}

describe("parseClubLogosFromHtml", () => {
  it("associe chaque nom de club à son URL de logo", () => {
    const html = [
      clubItem({ name: "Aalborg H&#xE5;ndbold", nation: "DEN", logoUrl: "https://res.ehf.eu/aalborg" }),
      clubItem({ name: "Barça", nation: "ESP", logoUrl: "https://res.ehf.eu/barca" }),
    ].join("");
    const logos = parseClubLogosFromHtml(html);
    expect(logos.get("Aalborg Håndbold")).toBe("https://res.ehf.eu/aalborg");
    expect(logos.get("Barça")).toBe("https://res.ehf.eu/barca");
    expect(logos.size).toBe(2);
  });

  it("décode les entités HTML hexadécimales et nommées dans le nom", () => {
    const html = clubItem({ name: "Rhein-Neckar L&#xF6;wen", nation: "GER", logoUrl: "https://res.ehf.eu/x" });
    const logos = parseClubLogosFromHtml(html);
    expect(logos.has("Rhein-Neckar Löwen")).toBe(true);
  });

  it("ignore un bloc incomplet (pas de data-src ou pas de tg-name)", () => {
    const html = `<a class="tg-item"><span class="tg-abbreviation">DEN</span></a>`;
    const logos = parseClubLogosFromHtml(html);
    expect(logos.size).toBe(0);
  });

  it("retourne une map vide sur du HTML sans bloc tg-item", () => {
    expect(parseClubLogosFromHtml("<html><body>rien ici</body></html>").size).toBe(0);
  });
});
