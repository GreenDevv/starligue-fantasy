"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogoutIcon } from "@/components/ui/icons";

// Bouton connexion/déconnexion rapide dans la navbar — évite de devoir passer par
// /login manuellement (utile notamment après un changement de rôle admin, qui ne
// prend effet qu'après une reconnexion : la session est en JWT, voir auth.ts).
export function AuthButton({ userName }: { userName?: string | null }) {
  if (!userName) {
    return (
      <Link
        href="/login"
        className="rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        Connexion
      </Link>
    );
  }

  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label="Se déconnecter"
      title={`Déconnexion (${userName})`}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-points-neg"
    >
      <LogoutIcon className="h-4 w-4" />
      <span className="hidden xl:inline">Déconnexion</span>
    </button>
  );
}
