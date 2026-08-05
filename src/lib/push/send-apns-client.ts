// Envoi direct à APNs (HTTP/2 + JWT ES256 signé avec la clé .p8) — ARCHITECTURE.md
// §20.2. Nécessaire côté iOS : @capacitor/push-notifications donne le token APNs
// brut (pas un jeton FCM), donc ni l'outil de test Firebase ni firebase-admin
// (qui exigent un vrai jeton FCM) ne peuvent l'utiliser directement — bypasse
// Firebase entièrement pour iOS plutôt que d'ajouter le SDK Firebase natif au
// projet Xcode juste pour faire ce pont.
import { createSign } from "crypto";
import http2 from "http2";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production: boolean;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Un JWT APNs reste valide jusqu'à 1h — mis en cache pour éviter de resigner à
// chaque envoi individuel sur un même run de cron.
let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;

function getApnsJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.keyId === config.keyId && now - cachedJwt.issuedAt < 50 * 60) {
    return cachedJwt.token;
  }
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = base64url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: config.privateKey, dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now, keyId: config.keyId };
  return token;
}

export interface ApnsSendResult {
  deviceToken: string;
  status: number;
  /** Présent seulement en cas d'échec, ex. "BadDeviceToken", "Unregistered". */
  reason?: string;
}

function sendOne(config: ApnsConfig, deviceToken: string, payload: object): Promise<ApnsSendResult> {
  return new Promise((resolve, reject) => {
    const host = config.production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    const client = http2.connect(host);
    client.on("error", reject);

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${getApnsJwt(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      client.close();
      const reason = body ? (JSON.parse(body).reason as string) : undefined;
      resolve({ deviceToken, status, reason });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.end(JSON.stringify(payload));
  });
}

export async function sendApnsToTokens(
  config: ApnsConfig,
  deviceTokens: string[],
  notification: { title: string; body: string; data?: Record<string, string> }
): Promise<ApnsSendResult[]> {
  const payload = {
    aps: { alert: { title: notification.title, body: notification.body }, sound: "default" },
    ...notification.data,
  };
  return Promise.all(deviceTokens.map((token) => sendOne(config, token, payload)));
}
