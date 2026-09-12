"use client";

import { SessionProvider } from "next-auth/react";
import { PushRegistration } from "@/components/PushRegistration";
import { LiveEventToaster } from "@/components/live/LiveEventToaster";
import { WebPushServiceWorkerUpdater } from "@/components/notifications/WebPushServiceWorkerUpdater";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PushRegistration />
      <LiveEventToaster />
      <WebPushServiceWorkerUpdater />
      {children}
    </SessionProvider>
  );
}
