"use client";

import { Suspense } from "react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/leagues";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", { email, password, redirect: false });

    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-points-neg/10 px-4 py-2 text-sm text-points-neg">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-lg bg-accent py-3 font-semibold text-bg transition-opacity disabled:opacity-50"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-2 text-3xl text-text">Connexion</h1>
        <p className="mb-6 text-sm text-text-muted">
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-accent hover:underline">
            S'inscrire
          </Link>
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
