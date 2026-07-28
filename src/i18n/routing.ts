import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "es", "ca", "de", "pt", "da", "pl"],
  defaultLocale: "fr",
  // "always" (et non "as-needed") : Railway ne gère pas correctement le rewrite
  // interne que next-intl utilise pour servir "/" sans préfixe visible en mode
  // as-needed (le proxy Railway traite le header x-middleware-rewrite comme une
  // vraie requête vers /fr, qui se fait à son tour "corriger" vers / par
  // next-intl — boucle de redirection infinie constatée en prod, jamais en
  // local). "always" élimine ce rewrite : /fr devient un segment réellement
  // matché, exactement comme /en, /es... — plus de mécanisme fragile.
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
