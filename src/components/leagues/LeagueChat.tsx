"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  userName: string;
}

const POLL_INTERVAL_MS = 5000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Fusionne en dédupliquant par id — un fetchNew() lancé avant l'envoi optimiste
// d'un message peut résoudre après coup et renvoyer ce même message (course entre
// le polling et handleSend), voir memory "double POST React Strict Mode".
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(prev.map((m) => m.id));
  return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
}

export function LeagueChat({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latestCreatedAt = useRef<string | null>(null);

  const fetchNew = useCallback(async () => {
    const url = latestCreatedAt.current
      ? `/api/leagues/${leagueId}/chat?since=${encodeURIComponent(latestCreatedAt.current)}`
      : `/api/leagues/${leagueId}/chat`;
    const res = await fetch(url);
    const json = (await res.json()) as { data?: { messages: ChatMessage[] } };
    const incoming = json.data?.messages ?? [];
    if (incoming.length === 0) return;
    const last = incoming[incoming.length - 1];
    if (!last) return;
    setMessages((prev) => mergeMessages(prev, incoming));
    latestCreatedAt.current = last.createdAt;
  }, [leagueId]);

  useEffect(() => {
    fetchNew();
    const interval = setInterval(fetchNew, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNew]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/leagues/${leagueId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const json = (await res.json()) as { data?: { message: ChatMessage }; error?: { message: string } };
    if (json.data) {
      const sent = json.data.message;
      setMessages((prev) => mergeMessages(prev, [sent]));
      latestCreatedAt.current = sent.createdAt;
      setDraft("");
    } else {
      setError(json.error?.message ?? "Erreur d'envoi");
    }
    setSending(false);
  }

  return (
    <div className="pixel-corners border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Chat de ligue</p>
        <span className="text-[10px] uppercase tracking-widest text-amber-400">Trash talk only</span>
      </div>

      <div ref={listRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            Personne n'a encore lancé les hostilités. À toi l'honneur.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === currentUserId;
            return (
              <div key={m.id} className={mine ? "self-end text-right" : "self-start"}>
                <p className="text-[10px] text-text-muted">
                  {mine ? "Toi" : m.userName} · {formatTime(m.createdAt)}
                </p>
                <p
                  className={[
                    "pixel-corners-sm mt-0.5 inline-block max-w-xs break-words px-3 py-1.5 text-sm",
                    mine ? "bg-accent/15 text-text" : "border border-border bg-bg text-text",
                  ].join(" ")}
                >
                  {m.content}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Envoie une pique à tes adversaires…"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="pixel-corners-sm border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          Envoyer
        </button>
      </form>
      {error && <p className="px-4 pb-2 text-xs text-points-neg">{error}</p>}
    </div>
  );
}
