"use client";

import { SessionProvider } from "next-auth/react";
import { PushRegistration } from "@/components/PushRegistration";
import { LiveEventToaster } from "@/components/live/LiveEventToaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PushRegistration />
      <LiveEventToaster />
      {children}
    </SessionProvider>
  );
}
