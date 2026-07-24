"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";
import { Button } from "@/components/ui/Button";
import type { SeasonMode } from "@/lib/team/active-team-context";

interface League {
  id: string;
  name: string;
  inviteCode: string | null;
  isOwner: boolean;
  memberCount: number;
  myRank: number;
  myPoints: number;
  jerseyConfig?: unknown;
}

interface LeaguesViewProps {
  initialLeagues: League[];
  mode: SeasonMode;
}

const SEASON_BADGE: Record<SeasonMode, string> = { live: "26/27", simulation: "Simu 25/26" };

export function LeaguesView({ initialLeagues, mode }: LeaguesViewProps) {
  const router = useRouter();
  const [leagues] = useState<League[]>(initialLeagues);
  const [panel, setPanel] = useState<"none" | "create" | "join">("none");
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; inviteCode: string } | null>(null);

  function togglePanel(p: "create" | "join") {
    setPanel((prev) => (prev === p ? "none" : p));
    setError(null);
    setCreated(null);
  }

  const isFirstLeague = leagues.length === 0;
  // Simulation n'a pas de maillot à personnaliser (SimulationTeam n'a pas de
  // jerseyConfig, divergence delibérée du schéma) — on saute l'étape identité.
  const firstLeagueOnboardingHref = (leagueId: string) =>
    mode === "simulation" ? `/team/build?league=${leagueId}` : `/team/identity?league=${leagueId}`;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName }),
    });
    const data = await res.json() as { data?: { id: string; name: string; inviteCode: string }; error?: { message: string } };
    if (data.data) {
      if (isFirstLeague) {
        router.push(firstLeagueOnboardingHref(data.data.id));
        return;
      }
      setCreated(data.data);
      setCreateName("");
      router.refresh();
    } else {
      setError(data.error?.message ?? "Erreur");
    }
    setLoading(false);
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode.toUpperCase() }),
    });
    const data = await res.json() as { data?: { leagueId: string }; error?: { message: string } };
    if (data.data) {
      setJoinCode("");
      setPanel("none");
      if (isFirstLeague) {
        router.push(firstLeagueOnboardingHref(data.data.leagueId));
        return;
      }
      router.push(`/leagues/${data.data.leagueId}`);
    } else {
      setError(data.error?.message ?? "Code invalide");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-text">Mes ligues</h1>
          {leagues.length > 0 && (
            <p className="mt-1 text-sm text-text-muted">{leagues.length} ligue{leagues.length > 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => togglePanel("join")}
            className={[
              "pixel-corners-sm border px-3 py-1.5 text-sm transition-colors",
              panel === "join"
                ? "border-accent text-accent shadow-glow-accent"
                : "border-border text-text-muted hover:text-text",
            ].join(" ")}
          >
            Rejoindre
          </button>
          <Button onClick={() => togglePanel("create")} size="sm" variant={panel === "create" ? "secondary" : "primary"}>
            + Créer
          </Button>
        </div>
      </div>

      {/* Create panel */}
      {panel === "create" && (
        <div className="pixel-corners border border-border bg-surface p-4">
          {created ? (
            <div className="flex flex-col gap-3 text-center">
              <p className="text-sm font-medium text-points-pos">Ligue créée !</p>
              <p className="text-sm text-text">{created.name}</p>
              <div className="pixel-corners-sm bg-bg p-3">
                <p className="mb-1 text-xs text-text-muted">Code d'invitation</p>
                <p className="font-arcade text-2xl tracking-widest text-accent drop-shadow-[0_0_6px_currentColor]">
                  {created.inviteCode}
                </p>
              </div>
              <button
                onClick={() => { setPanel("none"); setCreated(null); }}
                className="text-sm text-text-muted transition-colors hover:text-text"
              >
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <p className="text-sm font-medium text-text">Créer une ligue</p>
              <input
                type="text"
                placeholder="Nom de la ligue…"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="pixel-corners-sm w-full border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted transition-shadow focus:border-accent focus:shadow-glow-accent focus:outline-none"
                minLength={3}
                maxLength={50}
                required
              />
              {error && <p className="text-xs text-points-neg">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Création…" : "Créer →"}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Join panel */}
      {panel === "join" && (
        <div className="pixel-corners border border-border bg-surface p-4">
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <p className="text-sm font-medium text-text">Rejoindre avec un code</p>
            <input
              type="text"
              placeholder="ABCD1234"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="pixel-corners-sm w-full border border-border bg-bg px-3 py-2 text-center font-arcade text-xl uppercase tracking-widest text-accent placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted transition-shadow focus:border-accent focus:shadow-glow-accent focus:outline-none"
              maxLength={12}
              required
            />
            {error && <p className="text-center text-xs text-points-neg">{error}</p>}
            <Button type="submit" disabled={loading || joinCode.length < 6} className="w-full">
              {loading ? "Recherche…" : "Rejoindre →"}
            </Button>
          </form>
        </div>
      )}

      {/* Leagues list */}
      {leagues.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-10 text-center">
          <p className="text-text-muted">
            Ton équipe est liée à une ligue — crée la tienne ou rejoins celle d'un ami pour commencer.
          </p>
        </div>
      ) : (
        <motion.div
          className="flex flex-col gap-2"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {leagues.map((league) => (
            <motion.div
              key={league.id}
              variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
            >
              <Link
                href={`/leagues/${league.id}`}
                className="pixel-corners flex items-center gap-4 border border-border bg-surface px-4 py-3.5 transition-colors hover:border-accent/40"
              >
                <span className="pixel-corners-sm shrink-0 border border-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  {SEASON_BADGE[mode]}
                </span>
                {Boolean(league.jerseyConfig) && <JerseyBadge jerseyConfig={league.jerseyConfig} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text">{league.name}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {league.memberCount} membre{league.memberCount > 1 ? "s" : ""}
                    {league.isOwner && " · admin"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-arcade text-xl leading-none text-text tabular-nums">
                    #{league.myRank}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-text-muted">
                    {league.myPoints} pts
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
