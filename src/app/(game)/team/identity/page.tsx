"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { JerseyEditor } from "@/components/jersey/JerseyEditor";
import { DEFAULT_JERSEY_CONFIG, type JerseyConfig, safeJerseyConfig } from "@/lib/team/jersey";

interface TeamResponse {
  data?: { name: string; jerseyConfig: unknown };
}

export default function TeamIdentityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueId = searchParams.get("league");
  const from = searchParams.get("from");

  const [loading, setLoading] = useState(true);
  const [initialName, setInitialName] = useState("");
  const [initialConfig, setInitialConfig] = useState<JerseyConfig>(DEFAULT_JERSEY_CONFIG);

  useEffect(() => {
    if (!leagueId) {
      router.push("/leagues");
      return;
    }
    fetch(`/api/my-team?league=${leagueId}`)
      .then((r) => r.json())
      .then((data: TeamResponse) => {
        if (data.data) {
          setInitialName(data.data.name);
          setInitialConfig(safeJerseyConfig(data.data.jerseyConfig));
        }
        setLoading(false);
      });
  }, [leagueId, router]);

  if (!leagueId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl text-text">Ton équipe</h1>
        <p className="mt-1 text-sm text-text-muted">
          Choisis un nom et personnalise ton maillot — visible partout où ton équipe apparaît.
        </p>
      </div>

      <JerseyEditor
        leagueId={leagueId}
        initialName={initialName}
        initialConfig={initialConfig}
        onSaved={() => {
          if (from === "team") {
            router.push(`/leagues/${leagueId}`);
          } else {
            router.push(`/team/build?league=${leagueId}`);
          }
        }}
      />
    </div>
  );
}
