"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Club {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  externalIds: Record<string, string>;
  playerCount: number;
}

// ---- Avatar club ----

function ClubAvatar({ club, size = 40 }: { club: Club; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (club.logoUrl && !imgError) {
    return (
      <img
        src={club.logoUrl}
        alt={club.shortName}
        width={size}
        height={size}
        className="rounded object-contain"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded bg-accent/20 font-display font-bold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {club.shortName.slice(0, 3)}
    </div>
  );
}

// ---- Panel édition ----

function ClubPanel({
  club,
  onClose,
  onSaved,
}: {
  club: Club;
  onClose: () => void;
  onSaved: (updated: Club) => void;
}) {
  const [name, setName] = useState(club.name);
  const [shortName, setShortName] = useState(club.shortName);
  const [logoUrl, setLogoUrl] = useState(club.logoUrl ?? "");
  const [lnhSlug, setLnhSlug] = useState(club.externalIds.lnh ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasChanges =
    name !== club.name ||
    shortName !== club.shortName ||
    logoUrl !== (club.logoUrl ?? "") ||
    lnhSlug !== (club.externalIds.lnh ?? "");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/clubs/${club.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shortName, logoUrl, lnhSlug }),
      });
      const json = await res.json() as { data?: Club; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        onSaved({ ...club, ...json.data, playerCount: club.playerCount });
        onClose();
      } else {
        setError(json.error?.message ?? json.error?.code ?? "Erreur lors de la sauvegarde");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg uppercase tracking-wide text-text">{club.shortName}</h2>
        <button onClick={onClose} className="text-text-muted transition-colors hover:text-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Logo preview */}
        <div className="mb-6 flex justify-center">
          <ClubAvatar club={{ ...club, logoUrl: logoUrl || null, name, shortName }} size={80} />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Nom complet
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Code court
            </label>
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={20}
              className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              URL du logo
            </label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              type="url"
              placeholder="https://..."
              className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Slug LNH
            </label>
            <input
              value={lnhSlug}
              onChange={(e) => setLnhSlug(e.target.value.toLowerCase())}
              placeholder="ex: montpellier, paris, nantes…"
              className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              Utilisé par le scraper LNH pour associer les joueurs au bon club.
              Slugs connus : montpellier, paris, nantes, chambery, dunkerque,
              nimes, aix, toulouse, cesson-rennes, limoges, saint-raphael,
              selestat, chartres, tremblay, istres, dijon
            </p>
          </div>

          {/* ExternalIds lecture seule */}
          {Object.keys(club.externalIds).filter((k) => k !== "lnh").length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
                IDs externes
              </label>
              <div className="rounded border border-border bg-bg p-2">
                {Object.entries(club.externalIds)
                  .filter(([k]) => k !== "lnh")
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2 font-mono text-xs text-text-muted">
                      <span className="text-accent">{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="pt-1 text-xs text-text-muted">
            <span className="font-medium text-text">{club.playerCount}</span> joueur
            {club.playerCount !== 1 ? "s" : ""} actif{club.playerCount !== 1 ? "s" : ""} (saison active)
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        {error && (
          <p className="mb-3 rounded bg-points-neg/10 px-3 py-2 text-xs text-points-neg">{error}</p>
        )}
        <button
          onClick={save}
          disabled={!hasChanges || saving}
          className="w-full rounded bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}

// ---- Page ----

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selected, setSelected] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/clubs");
    const json = await res.json() as { data?: { clubs: Club[] } };
    if (json.data?.clubs) setClubs(json.data.clubs);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function handleSaved(updated: Club) {
    setClubs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">Clubs</h1>
        <p className="mt-1 text-sm text-text-muted">
          {clubs.length} club{clubs.length !== 1 ? "s" : ""} — cliquez pour modifier
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">Chargement…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setSelected(club)}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50"
            >
              <ClubAvatar club={club} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-base font-bold uppercase tracking-wider text-text">
                    {club.shortName}
                  </span>
                  {club.externalIds.lnh && (
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                      lnh:{club.externalIds.lnh}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-text-muted">{club.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-lg font-bold tabular-nums text-text">{club.playerCount}</span>
                <p className="text-[10px] text-text-muted">joueurs</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Panneau latéral */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              ref={overlayRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md overflow-hidden bg-surface shadow-2xl"
            >
              <ClubPanel
                club={selected}
                onClose={() => setSelected(null)}
                onSaved={(updated) => {
                  handleSaved(updated);
                  setSelected(updated);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
