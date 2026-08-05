"use client";

import { SessionProvider } from "next-auth/react";
import { PushRegistration } from "@/components/PushRegistration";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PushRegistration />
      {children}
    </SessionProvider>
  );
}
