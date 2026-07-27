"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PlayerOption {
  id: string;
  firstName: string;
  lastName: string;
  club: { shortName: string };
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Petite recherche joueur (250+ joueurs = trop long en <select> natif) — filtre
// client-side sur la liste déjà chargée, pas de requête réseau par frappe.
function PlayerSearch({
  players,
  value,
  onChange,
}: {
  players: PlayerOption[];
  value: string;
  onChange: (playerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = players.find((p) => p.id === value) ?? null;

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return players
      .filter((p) => normalize(`${p.firstName} ${p.lastName}`).includes(q))
      .slice(0, 8);
  }, [players, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-4 py-2.5">
        <span className="text-text">
          {selected.firstName} {selected.lastName}{" "}
          <span className="text-text-muted">— {selected.club.shortName}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="shrink-0 text-xs text-text-muted hover:text-text"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Cherche un nom…"
        className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
      />
      {open && query.trim() !== "" && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-2.5 text-sm text-text-muted">Aucun joueur trouvé</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-text transition-colors hover:bg-accent/10"
              >
                <span>
                  {p.firstName} {p.lastName}
                </span>
                <span className="shrink-0 text-xs text-text-muted">{p.club.shortName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
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
            <PlayerSearch players={players} value={favoritePlayerId} onChange={setFavoritePlayerId} />
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
