import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "es", "ca", "de", "pt", "da", "pl"],
  defaultLocale: "fr",
  // Le FR (langue actuelle du site, déjà indexée) garde ses URLs sans préfixe ;
  // seules les autres langues sont préfixées — évite de casser les liens/SEO existants.
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
