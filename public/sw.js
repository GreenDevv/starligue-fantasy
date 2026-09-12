// Service worker minimal pour les notifications Web Push (voir manifest.ts +
// src/components/notifications/WebPushSettings.tsx). Pas de cache offline ni de
// stratégie de fetch custom — seulement les deux événements requis par le
// protocole Web Push standard : `push` (affiche la notif reçue) et
// `notificationclick` (ouvre/focus l'app au clic).
//
// skipWaiting/clients.claim : sans ça, un abonné qui a déjà un service worker
// installé peut rester des jours sur une VIEILLE version (le navigateur ne
// revérifie /sw.js que ~1x/24h, et une nouvelle version installée reste "en
// attente" tant qu'aucun onglet de l'ancienne n'est fermé) — ex. réel du 12/09 :
// notifs reçues sans les boutons/le score ajoutés ce jour-là, alors que le code
// serveur était déjà à jour. Ici, la nouvelle version prend la main dès qu'elle
// est installée + active, sans attendre la fermeture des onglets ouverts. Voir
// aussi src/components/notifications/WebPushServiceWorkerUpdater.tsx (force une
// vérification à chaque chargement de page plutôt que d'attendre le cycle
// spontané du navigateur).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Starligue Fantasy", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // payload non-JSON (ne devrait pas arriver, notre serveur envoie toujours du JSON) — notif générique
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      image: payload.image,
      data: { url: payload.url },
      tag: payload.tag,
      // Discrets mais présents sur chaque notif (voir notify-live-events.ts
      // STANDARD_ACTIONS) : rejoindre le fil du match, ou les réglages de notifs.
      // Ignoré silencieusement par les navigateurs qui ne supportent pas les
      // actions (ex: iOS Safari) — la notif reste utilisable, juste sans bouton.
      actions: payload.actions,
    })
  );
});

// action "settings" → réglages de notifs (/account#live-notifications), quel que
// soit le match concerné ; sinon (clic sur le corps, ou action "view-match") → le
// fil du match (payload.url).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.action === "settings" ? "/account#live-notifications" : (event.notification.data?.url ?? "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
