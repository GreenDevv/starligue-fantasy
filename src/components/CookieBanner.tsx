"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const DISMISSED_KEY = "cookieBannerDismissed";

// Bandeau purement informatif, pas de boutons accepter/refuser : les 3 cookies du
// site sont tous techniques/fonctionnels (session de connexion + préférences),
// aucun consentement n'est requis pour ce type de cookie (recommandation CNIL) —
// voir /confidentialite pour le détail. Juste une notice dismissible une fois.
export function CookieBanner() {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-sm sm:rounded-lg sm:border">
      <p className="text-xs text-text-muted">
        {t("cookieBanner.text")}{" "}
        <Link href="/confidentialite" className="text-accent hover:underline">
          {t("cookieBanner.learnMore")}
        </Link>
      </p>
      <button
        onClick={dismiss}
        className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
      >
        {t("cookieBanner.dismiss")}
      </button>
    </div>
  );
}
