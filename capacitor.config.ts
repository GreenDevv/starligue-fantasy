import type { CapacitorConfig } from "@capacitor/cli";

// Shell natif "live URL" : la WebView charge directement le site déployé
// (Next.js server-rendered, pas d'export statique), le dossier `webDir`
// n'est requis que par le schéma du CLI et reste vide. `/fr` évite le hop de
// redirection de next-intl (`localePrefix: "always"`, voir src/i18n/routing.ts).
const config: CapacitorConfig = {
  appId: "fr.starliguefantasy.app",
  appName: "Handball Fantasy",
  webDir: "capacitor-www",
  server: {
    url: "https://starliguefantasy.fr/fr",
    cleartext: false,
    allowNavigation: ["starliguefantasy.fr", "*.starliguefantasy.fr"],
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0E1116",
      showSpinner: false,
    },
    // StatusBar retiré (2026-08-05) : @capacitor/status-bar@8.0.3 est cassé en
    // amont, son code Swift référence une API absente de toutes les versions
    // publiées de @capacitor/core (PluginConfig.getString, UIColor argb:) —
    // pas un problème de version chez nous. Purement cosmétique, à réintégrer
    // si/quand un correctif amont sort.
  },
};

export default config;
