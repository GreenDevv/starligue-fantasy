import webpush from "web-push";

// Enveloppe fine autour de `web-push` — configuration paresseuse (une seule fois,
// au premier envoi) via les clés VAPID générées le 11/09
// (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT). No-op si les
// clés sont absentes (dev local sans .env complet) plutôt que de planter.
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface WebPushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// `expired: true` = l'abonnement n'existe plus côté navigateur (404/410, ex:
// désinstallation, données de site effacées) — l'appelant doit le supprimer en base.
export async function sendWebPush(
  subscription: WebPushSubscriptionKeys,
  payload: WebPushPayload
): Promise<{ expired: boolean }> {
  if (!ensureConfigured()) return { expired: false };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    );
    return { expired: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) return { expired: true };
    console.warn("[web-push] erreur d'envoi:", String(err));
    return { expired: false };
  }
}
