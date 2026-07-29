"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { resolveApiError } from "@/lib/api/error-messages";

function ResetPasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError(t("auth.resetPassword.mismatchError"));
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const json = (await res.json()) as { error?: { code?: string; message: string } };
      if (json.error?.code === "INVALID_TOKEN" || json.error?.code === "TOKEN_EXPIRED") {
        setInvalidToken(true);
      } else {
        setError(resolveApiError(t, "auth", json.error?.code));
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (invalidToken) {
    return (
      <div>
        <h1 className="mb-2 text-3xl text-text">{t("auth.resetPassword.invalidTokenTitle")}</h1>
        <p className="mb-6 text-sm text-text-muted">{t("auth.resetPassword.invalidTokenMessage")}</p>
        <Link
          href="/forgot-password"
          className="block rounded-lg bg-accent py-3 text-center font-semibold text-bg transition-opacity"
        >
          {t("auth.resetPassword.requestNewLink")}
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div>
        <h1 className="mb-2 text-3xl text-text">{t("auth.resetPassword.title")}</h1>
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-text">
          {t("auth.resetPassword.successMessage")}
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-bg transition-opacity"
        >
          {t("auth.resetPassword.goToLogin")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl text-text">{t("auth.resetPassword.title")}</h1>
      <p className="mb-6 text-sm text-text-muted">{t("auth.resetPassword.subtitle")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
            {t("auth.resetPassword.passwordLabel")}
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
            placeholder={t("auth.resetPassword.passwordPlaceholder")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-text-muted">
            {t("auth.resetPassword.confirmLabel")}
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
            placeholder={t("auth.resetPassword.confirmPlaceholder")}
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
          {loading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
