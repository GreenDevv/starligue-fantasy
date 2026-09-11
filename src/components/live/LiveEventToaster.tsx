"use client";

// Notifications toast pour les événements live (buts, cartons, arrêts…) — voir
// GET /api/live/events. Montée globalement (Providers.tsx) : se fetch elle-même en
// polling léger, se cache tant qu'il n'y a rien à montrer (hors créneau de match,
// la route ne renvoie aucun événement → aucun coût de rendu). `since` = curseur
// serveur (même convention que le chat de ligue), pas d'horloge locale.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import type { Position } from "@/lib/squad/validation";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
const TOAST_DURATION_MS = 7_000;
const MAX_VISIBLE = 3;

interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

interface EventPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  photoOffsetX: number;
  photoOffsetY: number;
  photoZoom: number;
  owned: boolean;
}

interface LiveEvent {
  id: string;
  matchId: string;
  homeClub: ClubInfo;
  awayClub: ClubInfo;
  minute: number;
  period: "1H" | "2H";
  icon: string;
  text: string;
  homeScore: number;
  awayScore: number;
  sentiment: "positive" | "negative" | "neutral";
  player: EventPlayer | null;
}

const SENTIMENT_STYLE: Record<LiveEvent["sentiment"], string> = {
  positive: "border-l-points-pos shadow-glow-accent",
  negative: "border-l-points-neg shadow-glow-red",
  neutral: "border-l-border",
};

function Toast({ event, onDismiss }: { event: LiveEvent; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      role="status"
      onClick={onDismiss}
      className={cn(
        "pointer-events-auto flex cursor-pointer items-center gap-3 rounded-lg border-l-4 bg-surface p-3 shadow-lg ring-1 ring-border",
        SENTIMENT_STYLE[event.sentiment]
      )}
    >
      {event.player ? (
        <PlayerAvatar player={event.player} size="md" className={event.player.owned ? "ring-2 ring-accent" : undefined} />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg text-lg">⚡</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <ClubLogo club={event.homeClub} size="xs" />
          <span>
            {event.homeScore}-{event.awayScore}
          </span>
          <ClubLogo club={event.awayClub} size="xs" />
          <span className="ml-auto shrink-0 font-arcade text-sm text-accent-secondary">{event.minute}&apos;</span>
        </div>
        <p className="truncate text-sm font-medium text-text">{event.text}</p>
        {event.player?.owned && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">★ dans votre équipe</span>
        )}
      </div>
    </motion.div>
  );
}

export function LiveEventToaster() {
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const sinceRef = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const url = sinceRef.current ? `/api/live/events?since=${encodeURIComponent(sinceRef.current)}` : "/api/live/events";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { serverTime: string; events: LiveEvent[] } };
      if (!json.data) return;
      sinceRef.current = json.data.serverTime;
      if (json.data.events.length > 0) {
        setToasts((prev) => [...prev, ...json.data!.events].slice(-MAX_VISIBLE));
      }
    } catch {
      /* on réessaie au prochain tick */
    }
  }, []);

  useEffect(() => {
    void poll();
    timer.current = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [poll]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex w-full max-w-sm flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} event={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
