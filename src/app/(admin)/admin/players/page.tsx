"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhotoPositionEditor, type PhotoCrop } from "@/components/admin/PhotoPositionEditor";

// ---- Types ----

type Position = "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV";

interface Club {
  id: string;
  name: string;
  shortName: string;
}

interface Season {
  id: string;
  label: string;
  isActive: boolean;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  valuationPending: boolean;
  photoUrl: string | null;
  photoOffsetX: number;
  photoOffsetY: number;
  photoZoom: number;
  isActive: boolean;
  injuredAt: string | null;
  club: Club;
}

// ---- Constants ----

const POSITIONS: Position[] = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];

const POS_LABEL: Record<Position, string> = {
  GK: "Gardien", LW: "Ailier G.", LB: "Arrière G.",
  CB: "Demi-Centre", RB: "Arrière D.", RW: "Ailier D.", PV: "Pivot",
};

const POS_COLOR: Record<Position, string> = {
  GK: "bg-accent/20 text-accent",
  LW: "bg-amber-500/20 text-amber-400",
  LB: "bg-blue-500/20 text-blue-400",
  CB: "bg-purple-500/20 text-purple-400",
  RB: "bg-blue-500/20 text-blue-400",
  RW: "bg-amber-500/20 text-amber-400",
  PV: "bg-points-pos/20 text-points-pos",
};

const POS_AVATAR_BG: Record<Position, string> = {
  GK: "bg-accent/30", LW: "bg-amber-500/30", LB: "bg-blue-500/30",
  CB: "bg-purple-500/30", RB: "bg-blue-500/30", RW: "bg-amber-500/30", PV: "bg-points-pos/30",
};

// ---- Sub-components ----

function PlayerAvatar({ player, size = 36 }: { player: Player; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = `${player.firstName[0] ?? ""}${player.lastName[0] ?? ""}`.toUpperCase();

  if (player.photoUrl && !imgError) {
    return (
      <img
        src={player.photoUrl}
        alt={`${player.firstName} ${player.lastName}`}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: `${player.photoOffsetX}% ${player.photoOffsetY}%`,
          transform: `scale(${player.photoZoom})`,
        }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full text-xs font-bold text-white ${POS_AVATAR_BG[player.position]}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

function PositionBadge({ position }: { position: Position }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${POS_COLOR[position]}`}>
      {position}
    </span>
  );
}

// Import depuis l'ordinateur : redimensionne + recompresse côté client (canvas)
// avant stockage en data URI dans Player.photoUrl (TEXT, aucune limite pratique) —
// pas de service de stockage externe à mettre en place pour ce besoin ponctuel.
function resizeImageToDataUri(file: File, maxSize = 600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Edit / Create Panel ----

const emptyForm = {
  firstName: "", lastName: "", position: "CB" as Position,
  clubId: "", marketValue: "7.0", photoUrl: "", isActive: true,
  injuredAt: null as string | null,
  photoCrop: { offsetX: 50, offsetY: 50, zoom: 1 } as PhotoCrop,
};

function PlayerPanel({
  player,
  clubs,
  onClose,
  onSaved,
  onDeleted,
}: {
  player: Player | null; // null = create mode
  clubs: Club[];
  onClose: () => void;
  onSaved: (p: Player) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState(() =>
    player
      ? {
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          clubId: player.club.id,
          marketValue: String(player.marketValue),
          photoUrl: player.photoUrl ?? "",
          isActive: player.isActive,
          injuredAt: player.injuredAt,
          photoCrop: { offsetX: player.photoOffsetX, offsetY: player.photoOffsetY, zoom: player.photoZoom },
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [photoPreviewError, setPhotoPreviewError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setPhotoPreviewError(false);
  }, [form.photoUrl]);

  function set(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  }

  function setPhotoCrop(crop: PhotoCrop) {
    setForm((f) => ({ ...f, photoCrop: crop }));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier ensuite
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const dataUri = await resizeImageToDataUri(file);
      setForm((f) => ({ ...f, photoUrl: dataUri, photoCrop: { offsetX: 50, offsetY: 50, zoom: 1 } }));
    } catch {
      setUploadError("Import impossible, réessaie avec une autre image");
    } finally {
      setUploading(false);
    }
  }

  function declareInjured() {
    setForm((f) => ({ ...f, isActive: false, injuredAt: new Date().toISOString() }));
    setError("");
  }

  function clearInjury() {
    setForm((f) => ({ ...f, injuredAt: null }));
    setError("");
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.clubId) {
      setError("Prénom, nom et club sont requis");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = player ? `/api/admin/players/${player.id}` : "/api/admin/players";
      const method = player ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          position: form.position,
          clubId: form.clubId,
          marketValue: parseFloat(form.marketValue) || 5.0,
          photoUrl: form.photoUrl.trim() || undefined,
          photoOffsetX: form.photoCrop.offsetX,
          photoOffsetY: form.photoCrop.offsetY,
          photoZoom: form.photoCrop.zoom,
          isActive: form.isActive,
          injuredAt: form.injuredAt,
        }),
      });
      const json = await res.json() as { data?: Player; error?: { message?: string; code?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? json.error?.code ?? "Erreur");
      onSaved(json.data!);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!player) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/players/${player.id}`, { method: "DELETE" });
      const json = await res.json() as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Erreur");
      onDeleted(player.id);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg uppercase tracking-wide text-text">
          {player ? "Modifier le joueur" : "Nouveau joueur"}
        </h2>
        <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-5">

          {/* Photo preview */}
          <div className="flex items-center gap-4">
            {form.photoUrl && !photoPreviewError ? (
              <img
                src={form.photoUrl}
                alt="Preview"
                onError={() => setPhotoPreviewError(true)}
                className="h-16 w-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 border-border text-xl font-bold text-white ${form.position ? POS_AVATAR_BG[form.position] : "bg-surface"}`}>
                {`${form.firstName[0] ?? ""}${form.lastName[0] ?? ""}`.toUpperCase() || "?"}
              </div>
            )}
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                URL photo
              </label>
              <input
                value={form.photoUrl}
                onChange={(e) => set("photoUrl", e.target.value)}
                placeholder="https://..."
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Colle l'URL d'une photo LNH ou autre
              </p>
              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer rounded border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text">
                  {uploading ? "Import…" : "Importer depuis mon ordinateur"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFileUpload} />
                </label>
              </div>
              {uploadError && <p className="mt-1 text-[10px] text-points-neg">{uploadError}</p>}
            </div>
          </div>

          {/* Recadrage circulaire — même rendu que PlayerAvatar (pitch, marché…) */}
          {form.photoUrl && !photoPreviewError && (
            <div className="rounded-lg border border-border bg-bg/50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                Cadrage (glisser pour repositionner, slider pour zoomer)
              </p>
              <PhotoPositionEditor photoUrl={form.photoUrl} crop={form.photoCrop} onChange={setPhotoCrop} />
            </div>
          )}

          {/* Nom / Prénom */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">Prénom</label>
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">Nom</label>
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Poste */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-muted">Poste</label>
            <div className="grid grid-cols-4 gap-2">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => set("position", pos)}
                  className={`rounded py-1.5 text-xs font-bold transition-all ${
                    form.position === pos
                      ? `${POS_COLOR[pos]} ring-1 ring-current`
                      : "border border-border text-text-muted hover:border-accent/50"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-text-muted">{POS_LABEL[form.position]}</p>
          </div>

          {/* Club */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">Club</label>
            <select
              value={form.clubId}
              onChange={(e) => set("clubId", e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              <option value="">— Choisir un club —</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>
              ))}
            </select>
          </div>

          {/* Valeur marchande */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
              Valeur marchande (M)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="99.9"
                value={form.marketValue}
                onChange={(e) => set("marketValue", e.target.value)}
                className="w-28 rounded border border-border bg-bg px-3 py-2 text-sm text-text tabular-nums focus:border-accent focus:outline-none"
              />
              <span className="text-sm font-semibold text-accent-secondary">
                {parseFloat(form.marketValue || "0").toFixed(1)}M
              </span>
            </div>
          </div>

          {/* Statut */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm text-text">Actif</p>
              <p className="text-xs text-text-muted">Visible dans le marché</p>
            </div>
            <button
              onClick={() => set("isActive", !form.isActive)}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.isActive ? "bg-accent" : "bg-border"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isActive ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          {/* Blessure — déclaration manuelle, débloque le joker médical pour les
              équipes qui possèdent ce joueur (aucune API de blessures n'existe). */}
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text">Blessure longue durée</p>
                <p className="text-xs text-text-muted">
                  {form.injuredAt
                    ? `Déclaré blessé le ${new Date(form.injuredAt).toLocaleDateString("fr-FR")}`
                    : "Débloque le joker médical pour les équipes concernées"}
                </p>
              </div>
              {form.injuredAt ? (
                <button
                  onClick={clearInjury}
                  className="shrink-0 rounded border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text"
                >
                  Lever la blessure
                </button>
              ) : (
                <button
                  onClick={declareInjured}
                  className="shrink-0 rounded border border-points-neg/40 px-3 py-1.5 text-xs text-points-neg transition-colors hover:bg-points-neg/10"
                >
                  Déclarer blessé
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-points-neg/10 px-3 py-2 text-sm text-points-neg">{error}</p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border p-4 flex flex-col gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg transition-opacity disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : player ? "Enregistrer les modifications" : "Créer le joueur"}
        </button>

        {player && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-lg border border-points-neg/30 py-2 text-sm text-points-neg transition-colors hover:bg-points-neg/10"
          >
            Supprimer ce joueur
          </button>
        )}

        {player && confirmDelete && (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-lg border border-border py-2 text-sm text-text-muted"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-lg bg-points-neg py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "…" : "Confirmer la suppression"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---- Import scores LNH (saisons passées, pour valorisation future) ----

interface LnhScoresImportResult {
  seasonLabel: string;
  lnhSeasonsId: string;
  totalScraped: number;
  matched: number;
  transfersDetected: number;
  unmatchedCount: number;
  unmatched: Array<{ firstName: string; lastName: string; club: string; reason: string }>;
}

const LNH_SEASON_OPTIONS = [
  { seasonsId: "39", label: "2025/2026" },
  { seasonsId: "37", label: "2024/2025" },
  { seasonsId: "36", label: "2023/2024" },
];

function LnhScoresImportPanel() {
  const [seasonsId, setSeasonsId] = useState(LNH_SEASON_OPTIONS[0]!.seasonsId);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<LnhScoresImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleImport() {
    setImporting(true);
    setError("");
    setResult(null);
    const seasonLabel = LNH_SEASON_OPTIONS.find((o) => o.seasonsId === seasonsId)?.label ?? seasonsId;
    try {
      const res = await fetch("/api/admin/import/lnh-season-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonsId, seasonLabel }),
      });
      const json = await res.json() as {
        data?: LnhScoresImportResult;
        error?: { message?: string; code?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? json.error?.code ?? "Erreur import");
      setResult(json.data);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Scores LNH (historique)</span>
        <select
          value={seasonsId}
          onChange={(e) => setSeasonsId(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
        >
          {LNH_SEASON_OPTIONS.map((o) => (
            <option key={o.seasonsId} value={o.seasonsId}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={handleImport}
          disabled={importing}
          className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {importing ? "Import…" : "Scraper depuis lnh.fr"}
        </button>
        <span className="text-[11px] text-text-muted">
          Score LNH moyen par joueur pour la saison choisie — sert de base à une future valorisation
        </span>
      </div>

      {error && <p className="text-xs text-points-neg">{error}</p>}

      {result && (
        <div className="text-xs text-text-muted">
          <span className="font-medium text-points-pos">{result.matched} matchés</span>
          {" · "}{result.totalScraped} lignes scrapées ({result.seasonLabel})
          {result.transfersDetected > 0 && (
            <span className="text-accent-secondary">
              {" · "}{result.transfersDetected} via transfert détecté (club différent la saison passée)
            </span>
          )}
          {result.unmatchedCount > 0 && (
            <span className="text-points-neg">
              {" · "}{result.unmatchedCount} non reconnus (nouveau en Starligue / hors roster)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Application de la formule de valorisation depuis le Score LNH ----

interface ApplyValuationResult {
  seasonLabel: string;
  totalPlayers: number;
  valuedCount: number;
  updatedCount: number;
  pendingCount: number;
}

function ApplyValuationPanel({ onApplied }: { onApplied: () => void }) {
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyValuationResult | null>(null);
  const [error, setError] = useState("");

  async function handleApply() {
    setApplying(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/valuation/apply-lnh-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel: "2025/2026" }),
      });
      const json = await res.json() as {
        data?: ApplyValuationResult;
        error?: { message?: string; code?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? json.error?.code ?? "Erreur");
      setResult(json.data);
      onApplied();
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Appliquer la valorisation</span>
        <button
          onClick={handleApply}
          disabled={applying}
          className="rounded border border-accent-secondary/40 px-3 py-1.5 text-xs text-accent-secondary transition-colors hover:bg-accent-secondary/10 disabled:opacity-50"
        >
          {applying ? "Calcul…" : "Depuis Score LNH 2025/2026"}
        </button>
        <span className="text-[11px] text-text-muted">
          Normalise par poste (min-max, 4.0–20.0). Joueurs sans score → laissés en ND, à faire manuellement.
        </span>
      </div>

      {error && <p className="text-xs text-points-neg">{error}</p>}

      {result && (
        <div className="text-xs text-text-muted">
          <span className="font-medium text-points-pos">{result.updatedCount} valeurs mises à jour</span>
          {" · "}{result.valuedCount} joueurs valorisés au total
          {" · "}<span className="text-accent-secondary">{result.pendingCount} restent en ND</span>
        </div>
      )}
    </div>
  );
}

// ---- Export / import valorisation ----

interface UnmatchedValueRow {
  nom: string;
  prenom: string;
  club: string;
  valeur: number;
  reason: "player_not_found" | "ambiguous_match";
}

interface ValueImportResult {
  totalRows: number;
  updated: number;
  unchanged: number;
  unmatched: UnmatchedValueRow[];
}

function ValuationImportExport({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ValueImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier ensuite
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/admin/import/player-values", { method: "POST", body: fd });
      const json = await res.json() as {
        data?: ValueImportResult;
        error?: { message?: string; code?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? json.error?.code ?? "Erreur import");
      setResult(json.data);
      if (json.data.updated > 0) onImported();
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Valorisation</span>
        <a
          href="/api/admin/players/export"
          className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          Exporter (.xlsx)
        </a>
        <label className={`cursor-pointer rounded border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 ${importing ? "opacity-50" : ""}`}>
          {importing ? "Import…" : "Importer (.xlsx)"}
          <input type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={importing} />
        </label>
        <span className="text-[11px] text-text-muted">
          nom, prenom, club, valeur — met à jour uniquement la valeur des joueurs déjà existants
        </span>
      </div>

      {error && <p className="text-xs text-points-neg">{error}</p>}

      {result && (
        <div className="text-xs text-text-muted">
          <span className="font-medium text-points-pos">{result.updated} mis à jour</span>
          {" · "}{result.unchanged} inchangé{result.unchanged > 1 ? "s" : ""}
          {result.unmatched.length > 0 && (
            <span className="text-points-neg">
              {" · "}{result.unmatched.length} non reconnu{result.unmatched.length > 1 ? "s" : ""}
            </span>
          )}
          {result.unmatched.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {result.unmatched.slice(0, 10).map((u, i) => (
                <li key={i}>
                  {u.prenom} {u.nom} ({u.club}) —{" "}
                  {u.reason === "ambiguous_match" ? "correspond à plusieurs joueurs" : "joueur introuvable"}
                </li>
              ))}
              {result.unmatched.length > 10 && <li>… et {result.unmatched.length - 10} autre(s)</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Import photos joueurs (dataset curaté, hotlink sites officiels de club) ----

interface UnmatchedPhotoRow {
  nom: string;
  prenom: string;
  club: string;
  photoUrl: string;
  reason: "player_not_found" | "ambiguous_match";
}

interface PhotoImportResult {
  totalRows: number;
  updated: number;
  unchanged: number;
  unmatched: UnmatchedPhotoRow[];
}

function PhotoImportPanel({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PhotoImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleImport() {
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/import/player-photos", { method: "POST" });
      const json = await res.json() as {
        data?: PhotoImportResult;
        error?: { message?: string; code?: string };
      };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? json.error?.code ?? "Erreur import");
      setResult(json.data);
      if (json.data.updated > 0) onImported();
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Photos joueurs</span>
        <button
          onClick={handleImport}
          disabled={importing}
          className="rounded border border-accent/40 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {importing ? "Import…" : "Importer depuis prisma/player_photos_2026.json"}
        </button>
        <span className="text-[11px] text-text-muted">
          photos hotlinkées trouvées sur les sites officiels de club — ne crée ni ne supprime aucun joueur
        </span>
      </div>

      {error && <p className="text-xs text-points-neg">{error}</p>}

      {result && (
        <div className="text-xs text-text-muted">
          <span className="font-medium text-points-pos">{result.updated} mis à jour</span>
          {" · "}{result.unchanged} inchangé{result.unchanged > 1 ? "s" : ""}
          {result.unmatched.length > 0 && (
            <span className="text-points-neg">
              {" · "}{result.unmatched.length} non reconnu{result.unmatched.length > 1 ? "s" : ""}
            </span>
          )}
          {result.unmatched.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {result.unmatched.slice(0, 10).map((u, i) => (
                <li key={i}>
                  {u.prenom} {u.nom} ({u.club}) —{" "}
                  {u.reason === "ambiguous_match" ? "correspond à plusieurs joueurs" : "joueur introuvable"}
                </li>
              ))}
              {result.unmatched.length > 10 && <li>… et {result.unmatched.length - 10} autre(s)</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "">("");
  const [clubFilter, setClubFilter] = useState("");
  const [selected, setSelected] = useState<Player | null | "new">(null);

  const load = useCallback(async (sid?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (posFilter) params.set("position", posFilter);
    if (clubFilter) params.set("clubId", clubFilter);
    const effectiveSeasonId = sid ?? seasonId;
    if (effectiveSeasonId) params.set("seasonId", effectiveSeasonId);
    const res = await fetch(`/api/admin/players?${params}`);
    const json = await res.json() as { data?: { players: Player[]; clubs: Club[]; seasons: Season[]; currentSeasonId: string } };
    if (json.data) {
      setPlayers(json.data.players);
      setClubs(json.data.clubs);
      setSeasons(json.data.seasons ?? []);
      if (!seasonId && json.data.currentSeasonId) setSeasonId(json.data.currentSeasonId);
    }
    setLoading(false);
  }, [search, posFilter, clubFilter, seasonId]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(p: Player) {
    setPlayers((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
      return [...prev, p].sort((a, b) => a.club.shortName.localeCompare(b.club.shortName) || a.lastName.localeCompare(b.lastName));
    });
    setSelected(p);
  }

  function handleDeleted(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
  }

  const panelPlayer = selected === "new" ? null : selected;
  const showPanel = selected !== null;

  // Group by club for display
  const grouped = players.reduce<Record<string, Player[]>>((acc, p) => {
    const key = p.club.shortName;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide text-text">Joueurs</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading ? "…" : `${players.length} joueur${players.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {seasons.length > 1 && (
            <select
              value={seasonId}
              onChange={(e) => {
                setSeasonId(e.target.value);
                setClubFilter("");
                setPosFilter("");
                setSearch("");
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || "(sans nom)"}{s.isActive ? " ★" : ""}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setSelected("new")}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Nouveau joueur
          </button>
        </div>
      </div>

      {/* Export / import valorisation */}
      <ValuationImportExport onImported={() => load()} />

      {/* Import photos joueurs */}
      <PhotoImportPanel onImported={() => load()} />

      {/* Import scores LNH (historique, saisons passées) */}
      <LnhScoresImportPanel />

      {/* Application de la formule de valorisation */}
      <ApplyValuationPanel onApplied={() => load()} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value as Position | "")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          <option value="">Tous les postes</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p} — {POS_LABEL[p]}</option>)}
        </select>
        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          <option value="">Tous les clubs</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
        </select>
        {(search || posFilter || clubFilter) && (
          <button
            onClick={() => { setSearch(""); setPosFilter(""); setClubFilter(""); }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:text-text"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Player list */}
      {loading ? (
        <div className="py-12 text-center text-text-muted">Chargement…</div>
      ) : players.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-12 text-center text-text-muted">
          Aucun joueur trouvé
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([shortName, clubPlayers]) => (
            <div key={shortName} className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="border-b border-border bg-bg/50 px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-accent">{shortName}</span>
                <span className="text-xs text-text-muted">{clubPlayers[0]!.club.name}</span>
              </div>
              <div className="divide-y divide-border">
                {clubPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-border/20 ${selected !== "new" && selected?.id === p.id ? "bg-accent/5" : ""}`}
                  >
                    <PlayerAvatar player={p} size={32} />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={`text-sm font-medium ${p.isActive ? "text-text" : "text-text-muted line-through"}`}>
                        {p.firstName} {p.lastName}
                      </span>
                      {!p.isActive && (
                        <span className="rounded-full bg-points-neg/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-points-neg">
                          {p.injuredAt ? "Blessé" : "Inactif"}
                        </span>
                      )}
                    </div>
                    {p.valuationPending && (
                      <span
                        className="shrink-0 rounded-full bg-accent-secondary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-secondary"
                        title="Valeur provisoire — pas encore de méthode de valorisation appliquée"
                      >
                        ND
                      </span>
                    )}
                    <PositionBadge position={p.position} />
                    <span className="shrink-0 w-14 text-right text-sm font-semibold tabular-nums text-accent-secondary">
                      {p.marketValue.toFixed(1)}M
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-over panel overlay */}
      <AnimatePresence>
        {showPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <PlayerPanel
              player={panelPlayer}
              clubs={clubs}
              onClose={() => setSelected(null)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
