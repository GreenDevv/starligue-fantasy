import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "./routing";

// Un fichier JSON par namespace sous messages/<locale>/ (pas un seul gros
// fichier par langue) : chaque zone fonctionnelle du site possède son propre
// fichier, ce qui permet de les faire évoluer indépendamment sans toucher aux
// autres. Imports statiques (pas de fs/import() dynamique) : le build
// `output: "standalone"` (Railway) trace les dépendances par analyse statique
// des imports — un chemin construit dynamiquement ne serait pas embarqué dans
// le bundle standalone.
const NAMESPACES = [
  "common",
  "nav",
  "metadata",
  "errors",
  "labels",
  "dashboard",
  "account",
  "team",
  "market",
  "leagues",
  "leaderboard",
  "matches",
  "players",
  "clubs",
  "predictions",
  "starligue",
  "confidentialite",
  "auth",
  "admin",
] as const;

async function loadMessages(locale: AppLocale) {
  const modules = await Promise.all([
    import(`../../messages/${locale}/common.json`),
    import(`../../messages/${locale}/nav.json`),
    import(`../../messages/${locale}/metadata.json`),
    import(`../../messages/${locale}/errors.json`),
    import(`../../messages/${locale}/labels.json`),
    import(`../../messages/${locale}/dashboard.json`),
    import(`../../messages/${locale}/account.json`),
    import(`../../messages/${locale}/team.json`),
    import(`../../messages/${locale}/market.json`),
    import(`../../messages/${locale}/leagues.json`),
    import(`../../messages/${locale}/leaderboard.json`),
    import(`../../messages/${locale}/matches.json`),
    import(`../../messages/${locale}/players.json`),
    import(`../../messages/${locale}/clubs.json`),
    import(`../../messages/${locale}/predictions.json`),
    import(`../../messages/${locale}/starligue.json`),
    import(`../../messages/${locale}/confidentialite.json`),
    import(`../../messages/${locale}/auth.json`),
    import(`../../messages/${locale}/admin.json`),
  ]);

  return Object.fromEntries(
    NAMESPACES.map((namespace, i) => [namespace, modules[i].default])
  );
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
