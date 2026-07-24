// Helper d'authentification admin factorisé — adopté par les nouvelles routes de
// ce chantier (avancée admin de la simulation). Les ~20 routes admin existantes
// gardent leur check inline dupliqué (refactor pas demandé, hors périmètre).
import { auth } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await auth();
  // @ts-expect-error — role étendu, next-auth non re-déclaré (convention du projet)
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}
