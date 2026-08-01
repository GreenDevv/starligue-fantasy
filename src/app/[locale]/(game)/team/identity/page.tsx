"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { resolveApiError } from "@/lib/api/error-messages";

interface TeamResponse {
  data?: { name: string };
}

export default function TeamIdentityPage() {
  const t = useTranslations("team");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueId = searchParams.get("league");
  const from = searchParams.get("from");

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      router.push("/leagues");
      return;
    }
    fetch(`/api/my-team?league=${leagueId}`)
      .then((r) => r.json())
      .then((data: TeamResponse) => {
        if (data.data) setName(data.data.name);
        setLoading(false);
      });
  }, [leagueId, router]);

  if (!leagueId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">{tCommon("loading")}</p>
      </div>
    );
  }

  function goBack() {
    if (from === "team") {
      router.push(`/leagues/${leagueId}`);
    } else {
      router.push(`/team/build?league=${leagueId}`);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t("jersey.chooseNameError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/my-team/identity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, name: name.trim() }),
      });
      const data = (await res.json()) as { data?: { name: string }; error?: { code?: string; message: string } };
      if (data.data) {
        goBack();
      } else {
        setError(resolveApiError(tRoot, "team", data.error?.code));
        setSaving(false);
      }
    } catch {
      setError(resolveApiError(tRoot, "team", "NETWORK"));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl text-text">{t("identity.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("identity.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            {t("jersey.teamNameLabel")}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder={t("jersey.teamNamePlaceholder")}
            className="pixel-corners w-full border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {error && <p className="text-center text-sm text-points-neg">{error}</p>}
        <Button onClick={handleSubmit} disabled={saving} variant="primary" size="lg" className="w-full">
          {saving ? t("jersey.saving") : t("jersey.submitCta")}
        </Button>
      </div>
    </div>
  );
}
