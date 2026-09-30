"use client";

import { SessionProvider } from "next-auth/react";
import { withBasePath } from "@/lib/base-path";
import { PushRegistration } from "@/components/PushRegistration";
import { LiveEventToaster } from "@/components/live/LiveEventToaster";
import { WebPushServiceWorkerUpdater } from "@/components/notifications/WebPushServiceWorkerUpdater";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // basePath : sans ça, le jeu LBE (/lbe) demanderait sa session au jeu
    // Starligue (/api/auth). signIn/signOut de next-auth/react suivent ce réglage.
    <SessionProvider basePath={withBasePath("/api/auth")}>
      <PushRegistration />
      <LiveEventToaster />
      <WebPushServiceWorkerUpdater />
      {children}
    </SessionProvider>
  );
}
