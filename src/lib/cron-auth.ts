// Vérifie qu'un appel /api/cron/* est autorisé.
// Accepte deux formes :
//   1. Authorization: Bearer <CRON_SECRET>  — Railway cron jobs
//   2. Session Auth.js avec role ADMIN       — dashboard admin manuel
import { auth } from "@/lib/auth";

export async function verifyCronAuth(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;

  // 1. Bearer token (Railway)
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    if (!secret) return process.env.NODE_ENV === "development";
    return authHeader === `Bearer ${secret}`;
  }

  // 2. Session admin (dashboard)
  const session = await auth();
  // @ts-expect-error — role étendu
  return session?.user?.role === "ADMIN";
}
