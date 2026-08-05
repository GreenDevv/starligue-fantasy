"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// No-op sur le web : Capacitor.isNativePlatform() est false hors de l'app
// mobile, ce hook n'a donc aucun effet sur le site — ARCHITECTURE.md §20.2.
export function useRegisterPush(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;

    let registrationListener: { remove: () => void } | undefined;
    let errorListener: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const permission = await PushNotifications.requestPermissions();
      if (cancelled || permission.receive !== "granted") return;

      registrationListener = await PushNotifications.addListener("registration", async (token) => {
        try {
          await fetch("/api/push-tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: token.value,
              platform: Capacitor.getPlatform() === "ios" ? "IOS" : "ANDROID",
            }),
          });
        } catch {
          // Échec réseau non bloquant — un prochain lancement de l'app
          // redéclenchera l'enregistrement.
        }
      });

      // Écoute requise même sans traitement : sans elle, un échec
      // d'enregistrement natif remonte comme une exception non catchée côté
      // iOS/Android.
      errorListener = await PushNotifications.addListener("registrationError", () => {});

      await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      registrationListener?.remove();
      errorListener?.remove();
    };
  }, [enabled]);
}
