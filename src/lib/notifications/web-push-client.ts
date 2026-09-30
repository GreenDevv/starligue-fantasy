"use client";

import { withBasePath } from "@/lib/base-path";

// Helpers Web Push côté navigateur — voir public/sw.js (service worker) et
// src/components/notifications/WebPushSettings.tsx (UI). Souscrire nécessite un
// geste utilisateur explicite (bouton) : impossible de demander la permission
// automatiquement au chargement, le navigateur refuserait/ignorerait la demande.
//
// ⚠️ Sur iOS, ne fonctionne QUE si le site a été "Ajouté à l'écran d'accueil"
// (voir src/app/manifest.ts) — un onglet Safari classique n'a pas accès à
// PushManager du tout, isWebPushSupported() renverra false dans ce cas.
export function isWebPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Service worker du jeu servi : /sw.js (portée /) pour la Starligue, /lbe/sw.js
// (portée /lbe/) pour le jeu LBE (ARCHITECTURE.md §35.7). Même domaine : sous
// /lbe, getRegistration() renverrait AUSSI le worker Starligue (sa portée / couvre
// /lbe) — on ne garde qu'un enregistrement dont la portée est exactement la nôtre.
const SW_URL = withBasePath("/sw.js");
const SW_SCOPE = withBasePath("/");

async function findOwnRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return registration && new URL(registration.scope).pathname === SW_SCOPE ? registration : undefined;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return (await findOwnRegistration()) ?? (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }));
}

export async function getWebPushSubscriptionStatus(): Promise<"subscribed" | "unsubscribed"> {
  if (!isWebPushSupported()) return "unsubscribed";
  const registration = await findOwnRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "subscribed" : "unsubscribed";
}

export async function subscribeToWebPush(): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("vapid-key-missing");

  const registration = await getRegistration();
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON();
  const res = await fetch(withBasePath("/api/web-push/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) throw new Error("subscribe-failed");
}

export async function unsubscribeFromWebPush(): Promise<void> {
  const registration = await findOwnRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch(withBasePath("/api/web-push/subscribe"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {
    /* best-effort — l'abonnement navigateur est de toute façon déjà annulé */
  });
}
