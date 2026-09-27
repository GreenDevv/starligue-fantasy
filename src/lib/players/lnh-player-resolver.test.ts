import { describe, it, expect } from "vitest";
import {
  buildLnhPlayerIndex,
  lnhIdentityPatch,
  lnhNameKey,
  lnhSlugFromProfileUrl,
  resolveLnhPlayer,
} from "./lnh-player-resolver";

const MHB = "club-mhb";
const HBCN = "club-hbcn";

const players = [
  // renommé côté lnh.fr après J2 : slug connu
  { id: "monte", firstName: "Hugo", lastName: "MONTE DOS SANTOS", clubId: MHB, externalIds: { lnh_slug: "bryan-monte", lnh_name: "monte bryan" } },
  { id: "garciandia", firstName: "Imanol", lastName: "GARCIANDIA A.", clubId: HBCN, externalIds: {} },
  { id: "wenkegheu", firstName: "Andre", lastName: "WENKEGHEU TCHAMBOU", clubId: HBCN, externalIds: {} },
];

describe("lnhSlugFromProfileUrl", () => {
  it("extrait le slug de toutes les formes d'URL lnh.fr", () => {
    expect(lnhSlugFromProfileUrl("lnh/joueurs/gabriel-sculo")).toBe("gabriel-sculo");
    expect(lnhSlugFromProfileUrl("daikin-starligue/joueurs/bryan-monte")).toBe("bryan-monte");
    expect(lnhSlugFromProfileUrl("https://www.lnh.fr/api/daikin-starligue/joueurs/christoffer-bonde")).toBe("christoffer-bonde");
    expect(lnhSlugFromProfileUrl(null)).toBeNull();
    expect(lnhSlugFromProfileUrl("https://www.lnh.fr/matchs")).toBeNull();
  });
});

describe("resolveLnhPlayer", () => {
  const index = buildLnhPlayerIndex(players);

  it("slug prioritaire, même si le nom a changé", () => {
    expect(resolveLnhPlayer(index, { slug: "bryan-monte", lastName: "X", firstName: "Y", clubId: null })).toEqual({ playerId: "monte", method: "slug" });
  });

  it("flux live (pas de slug) : dernier nom lnh.fr connu", () => {
    expect(resolveLnhPlayer(index, { slug: null, lastName: "MONTE", firstName: "Bryan", clubId: MHB })).toEqual({ playerId: "monte", method: "lnh_name" });
  });

  it("repli sur notre nom, insensible aux accents et à la découpe nom/prénom", () => {
    expect(resolveLnhPlayer(index, { slug: null, lastName: "GARCIANDIA", firstName: "A. Imanol", clubId: HBCN })?.playerId).toBe("garciandia");
    expect(resolveLnhPlayer(index, { slug: "andre-wenkegheu", lastName: "WENKEGHEU TCHAMBOU", firstName: "André", clubId: HBCN })).toEqual({ playerId: "wenkegheu", method: "name" });
  });

  it("nom connu mais autre club → pas de rapprochement", () => {
    expect(resolveLnhPlayer(index, { slug: null, lastName: "GARCIANDIA A.", firstName: "Imanol", clubId: MHB })).toBeNull();
  });
});

describe("lnhIdentityPatch", () => {
  it("apprend slug + nom lnh.fr en conservant les autres clés", () => {
    expect(lnhIdentityPatch({ other: 1 }, { slug: "Imanol-Garciandia", lastName: "GARCIANDIA", firstName: "A. Imanol" })).toEqual({
      externalIds: { other: 1, lnh_slug: "imanol-garciandia", lnh_name: lnhNameKey("GARCIANDIA", "A. Imanol") },
      conflict: false,
    });
  });

  it("met à jour le nom lnh.fr après un renommage, rien à écrire sinon", () => {
    const current = { lnh_slug: "bryan-monte", lnh_name: "monte dos santos hugo" };
    expect(lnhIdentityPatch(current, { slug: "bryan-monte", lastName: "MONTE", firstName: "Bryan" })?.externalIds).toEqual({ lnh_slug: "bryan-monte", lnh_name: "monte bryan" });
    expect(lnhIdentityPatch({ lnh_slug: "bryan-monte", lnh_name: "monte bryan" }, { slug: "bryan-monte", lastName: "MONTE", firstName: "Bryan" })).toBeNull();
  });

  it("n'écrase jamais un slug différent", () => {
    expect(lnhIdentityPatch({ lnh_slug: "a" }, { slug: "b", lastName: "X", firstName: "Y" })?.conflict).toBe(true);
  });
});
