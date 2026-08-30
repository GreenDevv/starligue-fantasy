"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { PlayerSearch, type PlayerSearchOption } from "@/components/players/PlayerSearch";
import { HomeClubPicker, homeClubValueToPayload, type HomeClubValue } from "@/components/clubs/HomeClubPicker";
import { resolveApiError } from "@/lib/api/error-messages";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations();
  const tCommunity = useTranslations("community");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [favoritePlayerId, setFavoritePlayerId] = useState("");
  const [homeClub, setHomeClub] = useState<HomeClubValue>(null);
  const [players, setPlayers] = useState<PlayerSearchOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Facultatif (jamais bloquant) — liste chargée une fois, pas de session requise
  // (GET /api/players n'est pas derrière PROTECTED_PREFIXES).
  useEffect(() => {
    fetch("/api/players?perPage=500&sortBy=lastName&order=asc")
      .then((res) => res.json())
      .then((json: { data?: { players: PlayerSearchOption[] } }) => setPlayers(json.data?.players ?? []))
      .catch(() => setPlayers([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        favoritePlayerId: favoritePlayerId || undefined,
        homeClub: homeClub ? homeClubValueToPayload(homeClub) : undefined,
      }),
    });

    const json = (await res.json()) as { error?: { code?: string; message: string } };

    if (!res.ok) {
      setError(resolveApiError(t, "auth", json.error?.code));
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
      setError(t("auth.register.loginFailedAfterSignup"));
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
        <h1 className="mb-2 text-3xl text-text">{t("auth.register.title")}</h1>
        <p className="mb-6 text-sm text-text-muted">
          {t.rich("auth.register.alreadyRegisteredLine", {
            link: (chunks) => (
              <Link href="/login" className="text-accent hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              {t("auth.register.nameLabel")}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder={t("auth.register.namePlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              {t("auth.register.emailLabel")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder={t("auth.register.emailPlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              {t("auth.register.passwordLabel")}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
              placeholder={t("auth.register.passwordPlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              {t("auth.register.favoritePlayerLabel")}{" "}
              <span className="normal-case text-text-muted/70">{t("auth.register.optional")}</span>
            </label>
            <PlayerSearch players={players} value={favoritePlayerId} onChange={setFavoritePlayerId} />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
              {tCommunity("homeClub.label")}{" "}
              <span className="normal-case text-text-muted/70">{t("auth.register.optional")}</span>
            </label>
            <HomeClubPicker value={homeClub} onChange={setHomeClub} />
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
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>

          <p className="text-center text-xs text-text-muted">
            {t.rich("auth.register.consentLine", {
              link: (chunks) => (
                <Link href="/confidentialite" className="text-accent hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </form>
      </div>
    </main>
  );
}
