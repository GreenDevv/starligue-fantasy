// Service worker minimal pour les notifications Web Push (voir manifest.ts +
// src/components/notifications/WebPushSettings.tsx). Pas de cache offline ni de
// stratégie de fetch custom — seulement les deux événements requis par le
// protocole Web Push standard : `push` (affiche la notif reçue) et
// `notificationclick` (ouvre/focus l'app au clic).
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
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
