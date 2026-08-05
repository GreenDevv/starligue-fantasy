"use client";

import { useSession } from "next-auth/react";
import { useRegisterPush } from "@/lib/push/register-push";

// Monté globalement dans Providers.tsx — no-op tant qu'on est sur le web ou
// déconnecté (voir useRegisterPush). ARCHITECTURE.md §20.2.
export function PushRegistration() {
  const { status } = useSession();
  useRegisterPush(status === "authenticated");
  return null;
}
