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
  "stats",
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
    import(`../../messages/${locale}/stats.json`),
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
    // Sans timeZone explicite, next-intl retombe sur le fuseau de l'environnement
    // d'exécution — le SERVEUR (Railway, UTC) et le NAVIGATEUR (fuseau local du
    // visiteur, ex: Europe/Paris) divergent alors, ce qui ne pose aucun problème
    // pour formater une date déjà fixée (kickoffAt vient de la DB en UTC absolu),
    // mais casse toute date CONSTRUITE localement (`new Date(year, month, 1)`,
    // ex: le mois courant du calendrier club, ClubMatchesCalendar.tsx) : cette
    // construction utilise nécessairement le fuseau du runtime qui l'exécute (JS
    // natif, non contournable), donc "1er août 00:00" construit côté client
    // (Europe/Paris, UTC+2 l'été) vaut "31 juillet 22:00 UTC" — et si le
    // FORMATTAGE utilise ensuite le fuseau UTC (résolu côté serveur puis propagé
    // tel quel à l'hydratation client, next-intl ne réévalue pas côté navigateur)
    // ça affiche "juillet" au lieu d'"août". Repéré le 2026-08-02 par l'utilisateur
    // sur le calendrier de la page club, uniquement en prod (le décalage
    // serveur/navigateur n'existe pas en dev où les deux tournent sur la même
    // machine). Toutes les dates de l'app concernent un pays unique (Starligue,
    // handball français) quelle que soit la langue d'affichage choisie — fixer
    // Europe/Paris pour TOUT le monde (pas seulement les visiteurs français)
    // élimine la classe de bug entière plutôt que de la corriger composant par
    // composant.
    timeZone: "Europe/Paris",
  };
});
