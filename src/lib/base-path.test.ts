import { describe, it, expect } from "vitest";
import { withBasePath, isLbeProxyPath, forwardedOrigin, __test__ } from "./base-path";

describe("withBasePath", () => {
  it("jeu à la racine (Starligue) : chemin inchangé", () => {
    expect(withBasePath("/api/market", "")).toBe("/api/market");
  });

  it("jeu LBE : préfixe ajouté aux chemins absolus", () => {
    expect(withBasePath("/api/market", "/lbe")).toBe("/lbe/api/market");
    expect(withBasePath("/sw.js", "/lbe")).toBe("/lbe/sw.js");
    expect(withBasePath("/", "/lbe")).toBe("/lbe/");
  });

  it("jamais deux fois, jamais sur une URL absolue ou relative", () => {
    expect(withBasePath("/lbe/api/x", "/lbe")).toBe("/lbe/api/x");
    expect(withBasePath("/lbe", "/lbe")).toBe("/lbe");
    expect(withBasePath("https://ligue-feminine-handball.fr/logo.png", "/lbe")).toBe("https://ligue-feminine-handball.fr/logo.png");
    expect(withBasePath("//cdn.example.com/x.js", "/lbe")).toBe("//cdn.example.com/x.js");
    expect(withBasePath("api/x", "/lbe")).toBe("api/x");
  });

  it("« /lbex » n'est pas sous « /lbe »", () => {
    expect(withBasePath("/lbex/y", "/lbe")).toBe("/lbe/lbex/y");
  });
});

describe("normalisation de NEXT_PUBLIC_BASE_PATH", () => {
  it("absent ou vide → racine ; slash de tête ajouté, slash final retiré", () => {
    expect(__test__.normalize(undefined)).toBe("");
    expect(__test__.normalize("  ")).toBe("");
    expect(__test__.normalize("lbe/")).toBe("/lbe");
    expect(__test__.normalize("/lbe")).toBe("/lbe");
  });
});

describe("isLbeProxyPath", () => {
  it("/lbe et tout ce qui est dessous, rien d'autre", () => {
    expect(isLbeProxyPath("/lbe")).toBe(true);
    expect(isLbeProxyPath("/lbe/fr/team")).toBe(true);
    expect(isLbeProxyPath("/lbex")).toBe(false);
    expect(isLbeProxyPath("/fr/lbe")).toBe(false);
  });
});

describe("forwardedOrigin", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("hôte + protocole transmis par le jeu Starligue", () => {
    expect(forwardedOrigin(h({ "x-forwarded-host": "starliguefantasy.fr", "x-forwarded-proto": "https" }))).toBe(
      "https://starliguefantasy.fr"
    );
    expect(forwardedOrigin(h({ "x-forwarded-host": "localhost:3201", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost:3201"
    );
  });

  it("premier hôte d'une liste ; https par défaut", () => {
    expect(forwardedOrigin(h({ "x-forwarded-host": "starliguefantasy.fr, proxy.internal" }))).toBe(
      "https://starliguefantasy.fr"
    );
  });

  it("en-tête propre à l'appli prioritaire (x-forwarded-host écrasé par le proxy Railway)", () => {
    expect(
      forwardedOrigin(
        h({ "x-lbe-public-origin": "https://www.starliguefantasy.fr", "x-forwarded-host": "web-lbe-production.up.railway.app" })
      )
    ).toBe("https://www.starliguefantasy.fr");
    // Valeur invalide ignorée → repli sur x-forwarded-host.
    expect(forwardedOrigin(h({ "x-lbe-public-origin": "javascript:alert(1)", "x-forwarded-host": "starliguefantasy.fr" }))).toBe(
      "https://starliguefantasy.fr"
    );
  });

  it("absent ou invalide → null (requête non transférée)", () => {
    expect(forwardedOrigin(h({}))).toBeNull();
    expect(forwardedOrigin(h({ "x-forwarded-host": "evil.com/path" }))).toBeNull();
  });
});
