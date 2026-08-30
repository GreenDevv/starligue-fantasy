// Jeton signé (HMAC-SHA256, sans état) pour les liens « Valider » / « Rejeter »
// one-click des emails de modération de clubs d'origine (§23.5). La possession du
// jeton vaut autorisation : il n'est envoyé qu'aux admins, et signé avec
// `AUTH_SECRET` donc infalsifiable. TTL 7 jours. Aucune écriture en base (pas de
// migration) ; l'idempotence des actions (voir la route) couvre le rejeu.
import { createHmac, timingSafeEqual } from "crypto";

export type ClubAction = "verify" | "reject";

export const CLUB_ACTION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET manquante — impossible de signer un lien d'action club");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signClubActionToken(clubId: string, action: ClubAction, now: number = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ c: clubId, a: action, e: now + CLUB_ACTION_TOKEN_TTL_MS })));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyClubActionToken(
  token: string,
  now: number = Date.now(),
): { clubId: string; action: ClubAction } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];

  const expected = createHmac("sha256", secret()).update(payload).digest();
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const parsed = JSON.parse(fromB64url(payload).toString("utf8")) as { c?: unknown; a?: unknown; e?: unknown };
    if (typeof parsed.c !== "string" || (parsed.a !== "verify" && parsed.a !== "reject") || typeof parsed.e !== "number") {
      return null;
    }
    if (parsed.e <= now) return null;
    return { clubId: parsed.c, action: parsed.a };
  } catch {
    return null;
  }
}
