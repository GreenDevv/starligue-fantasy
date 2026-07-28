"use client";

import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LogoutIcon } from "@/components/ui/icons";

// Bouton connexion/déconnexion rapide dans la navbar — évite de devoir passer par
// /login manuellement (utile notamment après un changement de rôle admin, qui ne
// prend effet qu'après une reconnexion : la session est en JWT, voir auth.ts).
export function AuthButton({ userName }: { userName?: string | null }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  // next-auth's signOut({ callbackUrl }) n'a pas de notion de locale : le
  // préfixe courant doit être injecté manuellement.
  const loginPath = locale === routing.defaultLocale ? "/login" : `/${locale}/login`;

  if (!userName) {
    return (
      <Link
        href="/login"
        className="rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
      >
        {t("connexion")}
      </Link>
    );
  }

  return (
    <button
      onClick={() => signOut({ callbackUrl: loginPath })}
      aria-label={t("deconnexionAriaLabel")}
      title={t("deconnexionTitle", { name: userName })}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-points-neg"
    >
      <LogoutIcon className="h-4 w-4" />
      <span className="hidden xl:inline">{t("deconnexion")}</span>
    </button>
  );
}
