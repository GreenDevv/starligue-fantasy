"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";
import { PlayerSearch, type PlayerSearchOption } from "@/components/players/PlayerSearch";

interface AccountData {
  name: string;
  email: string;
  favoritePlayerId: string | null;
  favoritePlayer: { id: string; firstName: string; lastName: string; club: { shortName: string } } | null;
}

export default function AccountPage() {
  const t = useTranslations();
  const tAccount = useTranslations("account");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [favoritePlayerId, setFavoritePlayerId] = useState("");
  // Verrouillé dès qu'un joueur préféré était déjà déclaré au chargement — un choix
  // engageant, pas un champ qu'on retouche à chaque bonne/mauvaise perf (demande
  // explicite). Reste modifiable uniquement tant qu'aucun choix n'a jamais été fait.
  const [lockedFavoritePlayer, setLockedFavoritePlayer] = useState<AccountData["favoritePlayer"]>(null);
  const [players, setPlayers] = useState<PlayerSearchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/account").then((res) => res.json()),
      fetch("/api/players?perPage=500&sortBy=lastName&order=asc").then((res) => res.json()),
    ]).then(
      ([accountJson, playersJson]: [
        { data?: AccountData },
        { data?: { players: PlayerSearchOption[] } },
      ]) => {
        if (accountJson.data) {
          setName(accountJson.data.name);
          setEmail(accountJson.data.email);
          setFavoritePlayerId(accountJson.data.favoritePlayerId ?? "");
          setLockedFavoritePlayer(accountJson.data.favoritePlayer);
        }
        setPlayers(playersJson.data?.players ?? []);
        setLoading(false);
      },
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Verrouillé : on ne renvoie pas favoritePlayerId, rien à modifier côté serveur.
      body: JSON.stringify(lockedFavoritePlayer ? { name } : { name, favoritePlayerId: favoritePlayerId || null }),
    });
    const json = (await res.json()) as { error?: { code?: string; message: string } };

    if (!res.ok) {
      setError(resolveApiError(t, "account", json.error?.code));
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-text-muted">{tCommon("loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 font-display text-2xl uppercase tracking-wide text-text">{tAccount("title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">{tAccount("emailLabel")}</label>
          <p className="rounded-lg border border-border bg-bg px-4 py-2.5 text-text-muted">{email}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">{tAccount("nameLabel")}</label>
          <input
            type="text"
            required
            maxLength={50}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
            {tAccount("favoritePlayerLabel")}{" "}
            {!lockedFavoritePlayer && <span className="normal-case text-text-muted/70">{tAccount("optional")}</span>}
          </label>
          {lockedFavoritePlayer ? (
            <>
              <p className="rounded-lg border border-border bg-bg px-4 py-2.5 text-text">
                {lockedFavoritePlayer.firstName} {lockedFavoritePlayer.lastName}{" "}
                <span className="text-text-muted">— {lockedFavoritePlayer.club.shortName}</span>
              </p>
              <p className="mt-1 text-[11px] text-text-muted">{tAccount("favoritePlayerLocked")}</p>
            </>
          ) : (
            <PlayerSearch
              players={players}
              value={favoritePlayerId}
              onChange={(id) => {
                setFavoritePlayerId(id);
                setSaved(false);
              }}
            />
          )}
        </div>

        {error && <p className="rounded-lg bg-points-neg/10 px-4 py-2 text-sm text-points-neg">{error}</p>}
        {saved && (
          <p className="rounded-lg bg-points-pos/10 px-4 py-2 text-sm text-points-pos">
            {tAccount("savedMessage")}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-2 rounded-lg bg-accent py-3 font-semibold text-bg transition-opacity disabled:opacity-50"
        >
          {saving ? tAccount("saving") : tCommon("save")}
        </button>
      </form>
    </div>
  );
}
