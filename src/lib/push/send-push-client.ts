import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/db";

// Instancié à l'usage (pas au chargement du module) : évite un crash au
// build si FIREBASE_SERVICE_ACCOUNT_JSON n'est pas encore renseignée
// (même pattern que src/lib/email/resend-client.ts).
function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON manquante — impossible d'envoyer une notification push"
    );
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Envoie une notification à tous les devices enregistrés des utilisateurs
// donnés (FCM relaie vers APNs pour iOS, ARCHITECTURE.md §20.2). Les tokens
// que FCM signale comme invalides/désinstallés sont supprimés — un device
// désinstallé ne doit pas rester ciblé indéfiniment.
export async function sendPushToUsers(userIds: string[], notification: PushNotification): Promise<void> {
  if (userIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const messaging = getMessaging(getFirebaseApp());
  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: notification.title, body: notification.body },
    data: notification.data,
  });

  const invalidTokens = response.responses
    .map((r, i) => (!r.success && isUnregisteredError(r.error?.code) ? (tokens[i]?.token ?? null) : null))
    .filter((t): t is string => t !== null);

  if (invalidTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
  }
}

function isUnregisteredError(code: string | undefined): boolean {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}
