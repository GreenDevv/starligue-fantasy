"use client";

import { useState, useEffect, useMemo } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PlayerOption {
  id: string;
  firstName: string;
  lastName: string;
  club: { shortName: string };
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [favoritePlayerId, setFavoritePlayerId] = useState("");
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Facultatif (jamais bloquant) — liste chargée une fois, pas de session requise
  // (GET /api/players n'est pas derrière PROTECTED_PREFIXES).
  useEffect(() => {
    fetch("/api/players?perPage=500&sortBy=lastName&order=asc")
      .then((res) => res.json())
      .then((json: { data?: { players: PlayerOption[] } }) => setPlayers(json.data?.players ?? []))
      .catch(() => setPlayers([]));
  }, []);

  const playersByClub = useMemo(() => {
    const groups = new Map<string, PlayerOption[]>();
    for (const p of players) {
      const list = groups.get(p.club.shortName) ?? [];
      list.push(p);
      groups.set(p.club.shortName, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [players]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, favoritePlayerId: favoritePlayerId || undefined }),
    });

    const json = await res.json() as { error?: { message: string } };

    if (!res.ok) {
      setError(json.error?.message ?? "Une erreur est survenue.");
      setLoading(false);
      return;
    }

    // Auto-login après inscription
    const login = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (login?.error) {
      setError("Inscription réussie, mais connexion échouée. Essaie de te connecter manuellement.");
      setLoading(false);
    } else {
      // Chaque équipe est liée à une ligue : redirige vers /leagues, qui sert de
      // verrou obligatoire (créer/rejoindre) avant de pouvoir constituer un effectif.
      router.push("/leagues");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-2 text-3xl text-text">Créer un compte</h1>
        <p className="mb-6 text-sm text-text-muted">
          Déjà inscrit ?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Se connecter
          </Link>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              Ton prénom / pseudo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder="Martin"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder="toi@exemple.fr"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              Mot de passe
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder="6 caractères minimum"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              Ton joueur préféré <span className="normal-case text-text-muted/70">(facultatif)</span>
            </label>
            <select
              value={favoritePlayerId}
              onChange={(e) => setFavoritePlayerId(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text outline-none focus:border-accent"
            >
              <option value="">Pas de préférence</option>
              {playersByClub.map(([clubShortName, clubPlayers]) => (
                <optgroup key={clubShortName} label={clubShortName}>
                  {clubPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-points-neg/10 px-4 py-2 text-sm text-points-neg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-accent py-3 font-semibold text-bg transition-opacity disabled:opacity-50"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>

          <p className="text-center text-xs text-text-muted">
            En créant un compte, tu acceptes notre{" "}
            <Link href="/confidentialite" className="text-accent hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </form>
      </div>
    </main>
  );
}
