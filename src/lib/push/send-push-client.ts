import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/db";
import { sendApnsToTokens, type ApnsConfig } from "./send-apns-client";

// Instancié à l'usage (pas au chargement du module) : évite un crash au
// build si FIREBASE_SERVICE_ACCOUNT_JSON n'est pas encore renseignée
// (même pattern que src/lib/email/resend-client.ts). Android uniquement —
// voir send-apns-client.ts pour iOS.
function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON manquante — impossible d'envoyer une notification push Android"
    );
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

const APNS_BUNDLE_ID = "fr.starliguefantasy.app";

function getApnsConfig(): ApnsConfig {
  const privateKey = process.env.APNS_AUTH_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!privateKey || !keyId || !teamId) {
    throw new Error(
      "APNS_AUTH_KEY/APNS_KEY_ID/APNS_TEAM_ID manquants — impossible d'envoyer une notification push iOS"
    );
  }
  return {
    privateKey,
    keyId,
    teamId,
    bundleId: APNS_BUNDLE_ID,
    // ⚠️ bascule globale, pas par token — tant que l'app n'est distribuée que
    // via Xcode debug (Sandbox), laisser à false. À passer à true une fois en
    // TestFlight/App Store (voir docs/mobile-app.md et ARCHITECTURE.md §20.2).
    production: process.env.APNS_PRODUCTION === "true",
  };
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Envoie une notification à tous les devices enregistrés des utilisateurs
// donnés — Android via FCM (firebase-admin), iOS en direct à APNs (voir
// send-apns-client.ts pour le pourquoi de la séparation). Les tokens signalés
// invalides/désinstallés par l'un ou l'autre sont supprimés — un device
// désinstallé ne doit pas rester ciblé indéfiniment.
export async function sendPushToUsers(userIds: string[], notification: PushNotification): Promise<void> {
  if (userIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true, platform: true },
  });
  if (tokens.length === 0) return;

  const androidTokens = tokens.filter((t) => t.platform === "ANDROID").map((t) => t.token);
  const iosTokens = tokens.filter((t) => t.platform === "IOS").map((t) => t.token);
  const invalidTokens: string[] = [];

  if (androidTokens.length > 0) {
    const messaging = getMessaging(getFirebaseApp());
    const response = await messaging.sendEachForMulticast({
      tokens: androidTokens,
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    });
    response.responses.forEach((r, i) => {
      const token = androidTokens[i];
      if (token && !r.success && isFcmUnregisteredError(r.error?.code)) invalidTokens.push(token);
    });
  }

  if (iosTokens.length > 0) {
    const results = await sendApnsToTokens(getApnsConfig(), iosTokens, notification);
    for (const r of results) {
      if (r.status !== 200 && (r.reason === "BadDeviceToken" || r.reason === "Unregistered")) {
        invalidTokens.push(r.deviceToken);
      }
    }
  }

  if (invalidTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
  }
}

function isFcmUnregisteredError(code: string | undefined): boolean {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}
