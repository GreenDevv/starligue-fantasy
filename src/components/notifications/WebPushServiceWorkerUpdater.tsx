"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

// Un navigateur ne revérifie /sw.js pour une mise à jour que ~1x/24h tant que
// rien ne le lui demande explicitement (spec Service Worker) — un utilisateur
// déjà abonné pouvait donc rester des jours sur une ancienne version sans jamais
// recevoir les changements (ex. réel du 12/09 : notifs reçues sans les boutons/le
// score/le club ajoutés ce jour-là). Monté globalement (Providers.tsx) : force une
// vérification à chaque chargement de page — combiné à skipWaiting/clients.claim
// dans public/sw.js, la nouvelle version prend la main dès qu'elle est détectée,
// sans attendre que tous les onglets de l'ancienne se ferment.
export function WebPushServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration(withBasePath("/"))
      // Portée exacte : sous /lbe, ne pas relancer le worker du jeu Starligue.
      .then((registration) =>
        registration && new URL(registration.scope).pathname === withBasePath("/") ? registration.update() : undefined
      )
      .catch(() => {
        /* best-effort — pas grave si ça échoue, retenté au prochain chargement */
      });
  }, []);

  return null;
}
