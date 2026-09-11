import type { MetadataRoute } from "next";

// Rend le site installable ("Ajouter à l'écran d'accueil") — prérequis STRICT
// d'Apple pour que les notifications Web Push fonctionnent sur iOS (16.4+) : un
// visiteur qui reste dans un simple onglet Safari ne peut jamais recevoir de
// notif web, quel que soit le code côté serveur. Voir aussi
// src/components/notifications/WebPushSettings.tsx (bouton d'activation) et
// public/sw.js (service worker qui affiche les notifications reçues).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Starligue Fantasy",
    short_name: "Starligue Fantasy",
    description: "Jeu fantasy handball basé sur la Daikin StarLigue.",
    start_url: "/",
    display: "standalone",
    background_color: "#0E1116",
    theme_color: "#0E1116",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
