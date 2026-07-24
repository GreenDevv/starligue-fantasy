"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CopyInviteButton({ inviteCode }: { inviteCode: string }) {
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
      {copied ? "Copié ✓" : `${inviteCode} — copier`}
    </button>
  );
}

export function LeaveLeagueButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/leagues/${leagueId}/members/me`, {
      method: "DELETE",
    });
    const data = await res.json() as { data?: { success: boolean }; error?: { message: string } };
    if (data.data?.success) {
      router.push("/leagues");
    } else {
      setError(data.error?.message ?? "Erreur");
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
          Annuler
        </button>
        <button
          onClick={handleLeave}
          disabled={loading}
          className="pixel-corners-sm bg-points-neg px-3 py-1.5 text-xs text-white shadow-glow-red transition-colors hover:bg-points-neg/90 disabled:opacity-50"
        >
          {loading ? "…" : "Confirmer"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="pixel-corners-sm border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-points-neg/50 hover:text-points-neg"
    >
      Quitter la ligue
    </button>
  );
}

export function DeleteLeagueButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
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
          Annuler
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="pixel-corners-sm bg-points-neg px-3 py-1.5 text-xs text-white shadow-glow-red disabled:opacity-50"
        >
          {loading ? "…" : "Supprimer définitivement"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-points-neg/70 transition-colors hover:text-points-neg"
    >
      Supprimer la ligue
    </button>
  );
}
