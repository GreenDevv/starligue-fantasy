import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseLfhRencontres } from "@/lib/data-providers/lfh.provider";
import {
  planLfhSeason,
  lfhClubSlug,
  resolveLfhPlayer,
  isLfhGameweekReadyToConfirm,
  type LfhKnownPlayer,
} from "./lfh-season-plan";

// Extrait réel du calendrier poule 98 (LBE 2026-27) : J1 complète, 2 matchs de J2,
// et la rencontre 2918 (J12, janvier) sans date.
const fixtures = parseLfhRencontres(
  JSON.parse(readFileSync(resolve(__dirname, "../data-providers/__fixtures__/lfh-rencontres-poule98.json"), "utf-8"))
);
const journees = [
  { journee_numero: 1, date_debut: "2026-08-29" },
  { journee_numero: 2, date_debut: "2026-09-02" },
  { journee_numero: 12, date_debut: "2027-01-01" },
];

describe("lfhClubSlug", () => {
  it("extrait le slug de la fiche club", () => {
    expect(lfhClubSlug("https://ligue-feminine-handball.fr/clubs/metz-handball/")).toBe("metz-handball");
    expect(lfhClubSlug(null)).toBeNull();
  });
});

describe("planLfhSeason", () => {
  const plan = planLfhSeason(fixtures, journees);

  it("un club par équipe, clé technique = sigle, nom affiché court", () => {
    const brest = plan.clubs.find((c) => c.slug === "brest-bretagne-handball")!;
    expect(brest).toMatchObject({ lfhTeamId: "592", shortName: "BBH", name: "Brest Bretagne Handball", displayName: "Brest" });
  });

  it("sigle vide (Stella) → clé dérivée du slug", () => {
    expect(plan.clubs.find((c) => c.slug === "stella-st-maur-handball")!.shortName).toBe("STELLA");
  });

  it("deadline = 1 h avant le premier match de la journée", () => {
    const j1 = plan.gameweeks.find((g) => g.number === 1)!;
    expect(j1.matches).toHaveLength(6);
    // Premier match J1 : Brest–Besançon, 15:45 UTC.
    expect(j1.deadlineAt.toISOString()).toBe("2026-08-29T14:45:00.000Z");
  });

  it("journée étalée sur plusieurs jours : la deadline suit le mercredi, pas le samedi", () => {
    const j2 = plan.gameweeks.find((g) => g.number === 2)!;
    expect(j2.deadlineAt.toISOString()).toBe("2026-09-02T16:30:00.000Z"); // Dijon–Brest mer. 17:30 UTC, Besançon–Chambray sam.
  });

  it("match sans date : premier jour de la journée à 20h, marqué à confirmer", () => {
    const m = plan.gameweeks.flatMap((g) => g.matches).find((x) => x.rencontreId === "2918")!;
    expect(m.kickoffTbd).toBe(true);
    expect(m.kickoffAt.toISOString()).toBe("2027-01-01T18:00:00.000Z");
    expect(m.status).toBe("SCHEDULED");
  });

  it("résultats des matchs joués conservés", () => {
    const m = plan.gameweeks[0]!.matches.find((x) => x.rencontreId === "2854")!;
    expect(m).toMatchObject({ status: "FINISHED", homeScore: 21, awayScore: 46 });
  });

  it("refuse un match impossible à dater", () => {
    expect(() => planLfhSeason(fixtures, [])).toThrow(/2918/);
  });
});

describe("resolveLfhPlayer", () => {
  const known: LfhKnownPlayer[] = [
    { playerId: "p1", clubId: "brest", firstName: "Clarisse", lastName: "MAIROT", wpPlayerId: 13725, individuId: null },
    { playerId: "p2", clubId: "besancon", firstName: "Juliette", lastName: "MAIROT", wpPlayerId: null, individuId: "999" },
    { playerId: "p3", clubId: "brest", firstName: "Méline", lastName: "NOCANDY", wpPlayerId: null, individuId: null },
  ];
  const row = (o: Partial<{ wpPlayerId: number | null; individuId: string; firstName: string; lastName: string }>) => ({
    wpPlayerId: null,
    individuId: "0",
    firstName: "",
    lastName: "",
    ...o,
  });

  it("id WordPress d'abord, puis identifiant fédéral", () => {
    expect(resolveLfhPlayer(known, row({ wpPlayerId: 13725 }), "brest")?.playerId).toBe("p1");
    expect(resolveLfhPlayer(known, row({ individuId: "999" }), "besancon")?.playerId).toBe("p2");
  });

  it("repli nom + prénom dans le club, accents et casse ignorés (sœurs Mairot distinguées)", () => {
    expect(resolveLfhPlayer(known, row({ firstName: "MELINE", lastName: "NOCANDY" }), "brest")?.playerId).toBe("p3");
    expect(resolveLfhPlayer(known, row({ firstName: "JULIETTE", lastName: "MAIROT" }), "brest")).toBeNull();
  });
});

describe("isLfhGameweekReadyToConfirm", () => {
  const sat = new Date("2026-10-31T18:00:00Z"); // dernier match samedi 20 h
  const matches = [
    { kickoffAt: new Date("2026-10-30T18:00:00Z"), status: "FINISHED" },
    { kickoffAt: sat, status: "FINISHED" },
  ];

  it("48 h après la fin estimée du dernier match (coup d'envoi + 2 h)", () => {
    expect(isLfhGameweekReadyToConfirm(matches, new Date("2026-11-02T19:59:00Z"), 48)).toBe(false);
    expect(isLfhGameweekReadyToConfirm(matches, new Date("2026-11-02T20:00:00Z"), 48)).toBe(true);
  });

  it("un match encore à jouer bloque ; un match reporté non", () => {
    const later = new Date("2026-12-01T00:00:00Z");
    expect(isLfhGameweekReadyToConfirm([...matches, { kickoffAt: sat, status: "SCHEDULED" }], later, 48)).toBe(false);
    expect(isLfhGameweekReadyToConfirm([...matches, { kickoffAt: sat, status: "POSTPONED" }], later, 48)).toBe(true);
  });

  it("journée sans match : jamais", () => {
    expect(isLfhGameweekReadyToConfirm([], new Date("2030-01-01"), 48)).toBe(false);
  });
});
