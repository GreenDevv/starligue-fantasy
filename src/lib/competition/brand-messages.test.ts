import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { applyBrand, brandMessages, LFH_BRAND_RULES, LFH_KEY_OVERRIDES } from "./brand-messages";

const MESSAGES_DIR = resolve(__dirname, "../../../messages");

function loadLocale(locale: string): Record<string, unknown> {
  const dir = resolve(MESSAGES_DIR, locale);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(resolve(dir, f), "utf-8"))])
  );
}

function allStrings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(allStrings);
  return [];
}

function get(node: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], node);
}

describe("applyBrand", () => {
  it("formes longues avant les courtes", () => {
    const out = applyBrand(
      { a: "Daikin StarLigue", b: "Actus Starligue", c: "Accéder à Fantasy Starligue →", d: "notes LNH", e: "Daikin-Starligue-Tabelle" },
      LFH_BRAND_RULES
    );
    expect(out).toEqual({
      a: "Ligue Butagaz Énergie",
      b: "Actus Ligue Butagaz",
      c: "Accéder à LBE Fantasy →",
      d: "notes LFH",
      e: "Ligue Butagaz Énergie-Tabelle",
    });
  });

  it("une réécriture par clé l'emporte sur les règles", () => {
    const out = applyBrand({ players: { recap: { rating: "Note LNH" } } }, LFH_BRAND_RULES, { "players.recap.rating": "Note" });
    expect(out).toEqual({ players: { recap: { rating: "Note" } } });
  });

  it("ne touche pas aux mots qui contiennent LNH sans être LNH", () => {
    expect(applyBrand({ a: "LNHX" }, LFH_BRAND_RULES)).toEqual({ a: "LNHX" });
  });
});

describe("brandMessages sur les vraies traductions", () => {
  const locales = readdirSync(MESSAGES_DIR);

  it("Starligue : messages rendus tels quels (même objet)", () => {
    const fr = loadLocale("fr");
    expect(brandMessages(fr, "LNH", "fr")).toBe(fr);
  });

  // Hors admin : ses mentions de lnh.fr décrivent les outils d'import LNH, qui ne
  // sont pas rebaptisés mais masqués sur le jeu LBE (features du profil).
  it.each(locales)("LBE (%s) : plus aucune mention Starligue / LNH / Daikin", (locale) => {
    const { admin: _admin, ...publicMessages } = loadLocale(locale);
    const branded = brandMessages(publicMessages, "LFH", locale);
    const leftovers = allStrings(branded).filter((s) => /star ?ligue|\bLNH\b|daikin|liqui moly/i.test(s));
    expect(leftovers).toEqual([]);
  });

  it.each(Object.keys(LFH_KEY_OVERRIDES))("réécritures (%s) : chaque clé existe vraiment", (locale) => {
    const fr = loadLocale(locale);
    for (const key of Object.keys(LFH_KEY_OVERRIDES[locale]!)) {
      expect(typeof get(fr, key), key).toBe("string");
    }
  });
});

describe("français au féminin (jeu LBE)", () => {
  const fr = brandMessages(loadLocale("fr"), "LFH", "fr");
  const at = (key: string) => get(fr, key);

  // Phrases relues une par une le 29/09 : déterminants et accords.
  it.each([
    ["nav.players", "Joueuses"],
    ["labels.position.GK", "Gardienne"],
    ["labels.position.RW", "Ailière droite"],
    ["labels.position.RB", "Arrière droite"],
    ["team.common.bench", "Remplaçantes"],
    ["account.favoritePlayerLabel", "Joueuse préférée"],
    ["auth.register.favoritePlayerLabel", "Ta joueuse préférée"],
    ["market.noPlayersFound", "Aucune joueuse trouvée"],
    ["clubs.detail.noPlayers", "Aucune joueuse enregistrée pour l'instant."],
    ["team.errors.PLAYERS_NOT_FOUND", "Certaines joueuses sont introuvables"],
    ["team.errors.PLAYER_NOT_IN_SQUAD", "Cette joueuse n'est pas dans ton effectif"],
    ["team.start.startersHint", "Titulaires · tap une joueuse pour échanger avec sa remplaçante"],
    ["team.build.squadHint", "Ton effectif · tap un emplacement vide pour choisir, tap une joueuse pour la retirer"],
    ["team.auction.errors.unknownPlayer", "Une des joueuses sélectionnées est introuvable, réessaie."],
    ["dashboard.bestXIWidget.subtitle", "Équipe type de la saison · meilleures joueuses par poste"],
    ["players.detail.avgRatingShort", "moy. {rating}"],
  ])("%s → %s", (key, expected) => {
    expect(at(key)).toBe(expected);
  });

  it("joker médical : « une joueuse blessée »", () => {
    expect(at("team.transfers.jokerAvailable")).toMatch(/pour une joueuse blessée\./);
  });

  it("plus aucun « joueur » ni accord masculin résiduel hors admin", () => {
    const { admin: _admin, ...rest } = fr as Record<string, unknown>;
    const bad = allStrings(rest).filter((s) =>
      /\b[Jj]oueurs?\b|\b(Aucun|Certains|un|le|ce) joueuse|joueuse (préféré|trouvé|blessé|enregistré)(?!e)/.test(s)
    );
    expect(bad).toEqual([]);
  });

  it("anglais inchangé côté vocabulaire (« player » est neutre)", () => {
    const en = brandMessages(loadLocale("en"), "LFH", "en");
    expect(get(en, "nav.players")).toBe(get(loadLocale("en"), "nav.players"));
  });
});
