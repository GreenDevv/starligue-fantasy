"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { resolveApiError } from "@/lib/api/error-messages";

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, locale }),
    });

    if (!res.ok) {
      const json = (await res.json()) as { error?: { code?: string; message: string } };
      setError(resolveApiError(t, "auth", json.error?.code));
      setLoading(false);
      return;
    }

    // Réponse toujours identique côté serveur (anti-enumeration) : le succès
    // ne confirme jamais que l'email existe.
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-2 text-3xl text-text">{t("auth.forgotPassword.title")}</h1>
        <p className="mb-6 text-sm text-text-muted">{t("auth.forgotPassword.subtitle")}</p>

        {sent ? (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-text">
            {t("auth.forgotPassword.successMessage")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
                {t("auth.forgotPassword.emailLabel")}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
                placeholder={t("auth.forgotPassword.emailPlaceholder")}
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
              {loading ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-accent hover:underline">
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
