"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

export function CopyInviteButton({ inviteCode }: { inviteCode: string }) {
  const t = useTranslations("leagues");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className={[
        "pixel-corners-sm border px-3 py-1.5 text-xs transition-colors",
        copied ? "border-points-pos/40 text-points-pos" : "border-border bg-surface text-text-muted hover:text-text",
      ].join(" ")}
    >
      {copied ? t("actions.copied") : t("actions.copyInvite", { code: inviteCode })}
    </button>
  );
}

// Bascule la ligue active (cookie activeLeagueId) puis renvoie vers /team, qui
// affiche l'équipe de cette ligue. Sans ça, /team résoudrait la ligue du cookie
// (potentiellement une autre pour un utilisateur multi-ligues).
export function SwitchToTeamButton({ leagueId, label }: { leagueId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      await fetch("/api/team/active-league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId }),
      });
    } catch {
      // best-effort : /team acceptera de toute façon ?league= en secours
    }
    router.push(`/team?league=${leagueId}`);
    router.refresh();
  }

  return (
    <button
      onClick={go}
      disabled={loading}
      className="pixel-corners-sm shrink-0 bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90 disabled:opacity-50"
    >
      {loading ? "…" : label}
    </button>
  );
}

export function LeaveLeagueButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const t = useTranslations("leagues");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/leagues/${leagueId}/members/me`, {
      method: "DELETE",
    });
    const data = await res.json() as { data?: { success: boolean }; error?: { code?: string; message: string } };
    if (data.data?.success) {
      router.push("/leagues");
    } else {
      setError(resolveApiError(tRoot, "leagues", data.error?.code));
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        {error && <p className="text-xs text-points-neg">{error}</p>}
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-text-muted hover:text-text"
        >
          {tCommon("cancel")}
        </button>
        <button
          onClick={handleLeave}
          disabled={loading}
          className="pixel-corners-sm bg-points-neg px-3 py-1.5 text-xs text-white shadow-glow-red transition-colors hover:bg-points-neg/90 disabled:opacity-50"
        >
          {loading ? "…" : tCommon("confirm")}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="pixel-corners-sm border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-points-neg/50 hover:text-points-neg"
    >
      {t("actions.leaveLeague")}
    </button>
  );
}

export function DeleteLeagueButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const t = useTranslations("leagues");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/leagues/${leagueId}`, { method: "DELETE" });
    router.push("/leagues");
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setConfirming(false)} className="text-xs text-text-muted hover:text-text">
          {tCommon("cancel")}
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="pixel-corners-sm bg-points-neg px-3 py-1.5 text-xs text-white shadow-glow-red disabled:opacity-50"
        >
          {loading ? "…" : t("actions.deleteConfirm")}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-points-neg/70 transition-colors hover:text-points-neg"
    >
      {t("actions.deleteLeague")}
    </button>
  );
}
