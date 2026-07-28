"use client";

import { Suspense } from "react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

function LoginForm() {
  // router.push brut (pas @/i18n/navigation) : callbackUrl vient soit du
  // query param posé par auth.ts (déjà un chemin absolu préfixé par la
  // locale), soit du fallback ci-dessous — jamais un chemin next-intl à
  // re-préfixer, sinon double-préfixage (/en/en/leagues).
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("auth");
  const defaultCallback = `/${locale}/leagues`;
  const callbackUrl = params.get("callbackUrl") ?? defaultCallback;

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
      setError(t("login.invalidCredentials"));
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
          {t("login.emailLabel")}
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
          placeholder={t("login.emailPlaceholder")}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
          {t("login.passwordLabel")}
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
          placeholder={t("login.passwordPlaceholder")}
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
        {loading ? t("login.submitting") : t("login.submit")}
      </button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-2 text-3xl text-text">{t("login.title")}</h1>
        <p className="mb-6 text-sm text-text-muted">
          {t.rich("login.noAccountLine", {
            link: (chunks) => (
              <Link href="/register" className="text-accent hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
