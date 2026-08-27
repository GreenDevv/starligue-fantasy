"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  userName: string;
}

const POLL_INTERVAL_MS = 5000;

// Fusionne en dédupliquant par id — un fetchNew() lancé avant l'envoi optimiste
// d'un message peut résoudre après coup et renvoyer ce même message (course entre
// le polling et handleSend), voir memory "double POST React Strict Mode".
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(prev.map((m) => m.id));
  return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
}

export function LeagueChat({ leagueId, currentUserId }: { leagueId: string; currentUserId: string }) {
  const t = useTranslations("leagues");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latestCreatedAt = useRef<string | null>(null);
  // Menu signaler/bloquer (guideline App Store 1.2, ARCHITECTURE.md §21) —
  // un seul menu ouvert à la fois, fermé par défaut, jamais sur ses propres
  // messages.
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [confirmingBlockOf, setConfirmingBlockOf] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  async function handleReport(messageId: string) {
    const res = await fetch(`/api/leagues/${leagueId}/chat/${messageId}/report`, { method: "POST" });
    if (res.ok) {
      // Le menu reste ouvert : c'est lui qui contient le bouton, et c'est ce
      // bouton qui bascule sur "Signalé" (désactivé) pour donner une
      // confirmation visible. Le fermer ici — même après le fetch — masque
      // cette confirmation dans le même rendu et donne l'impression que rien
      // ne s'est passé. L'utilisateur referme lui-même via "⋯".
      setReportedIds((prev) => new Set(prev).add(messageId));
    } else {
      setError(resolveApiError(tRoot, "leagues", (await res.json().catch(() => null))?.error?.code));
    }
  }

  async function handleBlock(userId: string) {
    setMenuOpenFor(null);
    setConfirmingBlockOf(null);
    const res = await fetch("/api/blocked-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.userId !== userId));
    }
  }

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
    const json = (await res.json()) as { data?: { message: ChatMessage }; error?: { code?: string; message: string } };
    if (json.data) {
      const sent = json.data.message;
      setMessages((prev) => mergeMessages(prev, [sent]));
      latestCreatedAt.current = sent.createdAt;
      setDraft("");
    } else {
      setError(resolveApiError(tRoot, "leagues", json.error?.code));
    }
    setSending(false);
  }

  return (
    <div className="pixel-corners border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">{t("chat.title")}</p>
        <span className="text-[10px] uppercase tracking-widest text-amber-400">{t("chat.badge")}</span>
      </div>

      <div ref={listRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            {t("chat.emptyState")}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === currentUserId;
            return (
              <div key={m.id} className={mine ? "self-end text-right" : "self-start"}>
                <div className={`flex items-center gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                  <p className="text-[10px] text-text-muted">
                    {mine ? t("chat.you") : m.userName} · {format.dateTime(new Date(m.createdAt), { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {!mine && (
                    <button
                      type="button"
                      onClick={() => setMenuOpenFor(menuOpenFor === m.id ? null : m.id)}
                      aria-label={t("chat.moreActions")}
                      className="text-text-muted hover:text-text"
                    >
                      ⋯
                    </button>
                  )}
                </div>
                <p
                  className={[
                    "pixel-corners-sm mt-0.5 inline-block max-w-xs break-words px-3 py-1.5 text-sm",
                    mine ? "bg-accent/15 text-text" : "border border-border bg-bg text-text",
                  ].join(" ")}
                >
                  {m.content}
                </p>
                {menuOpenFor === m.id && (
                  <div className="pixel-corners-sm mt-1 flex flex-col items-start gap-1 border border-border bg-surface p-2 text-left">
                    {confirmingBlockOf === m.userId ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted">{t("chat.blockConfirm")}</span>
                        <button
                          type="button"
                          onClick={() => setConfirmingBlockOf(null)}
                          className="text-text-muted hover:text-text"
                        >
                          {tCommon("cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBlock(m.userId)}
                          className="font-semibold text-points-neg"
                        >
                          {tCommon("confirm")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={reportedIds.has(m.id)}
                          onClick={() => handleReport(m.id)}
                          className="text-xs text-text-muted hover:text-text disabled:opacity-40"
                        >
                          {reportedIds.has(m.id) ? t("chat.reported") : t("chat.report")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingBlockOf(m.userId)}
                          className="text-xs text-points-neg hover:text-points-neg/80"
                        >
                          {t("chat.block")}
                        </button>
                      </>
                    )}
                  </div>
                )}
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
          placeholder={t("chat.inputPlaceholder")}
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="pixel-corners-sm border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          {t("chat.send")}
        </button>
      </form>
      {error && <p className="px-4 pb-2 text-xs text-points-neg">{error}</p>}
    </div>
  );
}
