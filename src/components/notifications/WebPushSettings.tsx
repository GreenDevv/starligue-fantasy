"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  isWebPushSupported,
  getWebPushSubscriptionStatus,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from "@/lib/notifications/web-push-client";

// Bouton d'activation des notifications Web Push, dans la section notifications de
// /account. Statut vérifié uniquement côté client (SSR ne sait rien du navigateur) —
// `checked` évite d'afficher quoi que ce soit avant d'avoir la vraie réponse.
export function WebPushSettings() {
  const t = useTranslations("account");
  const [checked, setChecked] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok = isWebPushSupported();
    setSupported(ok);
    if (!ok) {
      setChecked(true);
      return;
    }
    getWebPushSubscriptionStatus().then((status) => {
      setSubscribed(status === "subscribed");
      setChecked(true);
    });
  }, []);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      if (subscribed) {
        await unsubscribeFromWebPush();
        setSubscribed(false);
      } else {
        await subscribeToWebPush();
        setSubscribed(true);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "unknown";
      setError(code === "permission-denied" ? t("liveNotifications.webPushDenied") : t("liveNotifications.webPushError"));
    } finally {
      setLoading(false);
    }
  }

  if (!checked) return null;

  if (!supported) {
    return <p className="mt-2 text-[11px] text-text-muted">{t("liveNotifications.webPushUnsupported")}</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={`self-start rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          subscribed
            ? "border-border text-text-muted hover:bg-surface"
            : "border-accent text-accent hover:bg-accent/10"
        }`}
      >
        {loading ? t("saving") : subscribed ? t("liveNotifications.webPushDisable") : t("liveNotifications.webPushEnable")}
      </button>
      {error && <p className="text-[11px] text-points-neg">{error}</p>}
      {!subscribed && <p className="text-[11px] text-text-muted">{t("liveNotifications.webPushHint")}</p>}
    </div>
  );
}
