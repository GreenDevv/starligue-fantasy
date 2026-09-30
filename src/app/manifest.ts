import type { MetadataRoute } from "next";
import { getCompetitionProfile } from "@/lib/competition/profile";
import { withBasePath } from "@/lib/base-path";

// Rend le site installable ("Ajouter à l'écran d'accueil") — prérequis STRICT
// d'Apple pour que les notifications Web Push fonctionnent sur iOS (16.4+) : un
// visiteur qui reste dans un simple onglet Safari ne peut jamais recevoir de
// notif web, quel que soit le code côté serveur. Voir aussi
// src/components/notifications/WebPushSettings.tsx (bouton d'activation) et
// public/sw.js (service worker qui affiche les notifications reçues).
export default function manifest(): MetadataRoute.Manifest {
  const competition = getCompetitionProfile();
  return {
    name: competition.appName,
    short_name: competition.appName,
    description: `Jeu fantasy handball basé sur la ${competition.leagueName}.`,
    // Préfixe du jeu servi (LBE : /lbe) — un manifest n'hérite pas du basePath.
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    background_color: "#0E1116",
    theme_color: "#0E1116",
    icons: [
      { src: withBasePath("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBasePath("/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
