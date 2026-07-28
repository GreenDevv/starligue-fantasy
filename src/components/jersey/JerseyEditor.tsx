"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  CURATED_JERSEY_SWATCHES,
  JERSEY_COLLARS,
  KIT_ZONES,
  type JerseyConfig,
  type KitZoneName,
} from "@/lib/team/jersey";
import { KIT_PATTERNS, getPattern } from "@/lib/team/kitPatterns";
import { KIT_SILHOUETTES, silhouetteToSvgPath } from "@/lib/team/kitSilhouettes";
import { Button } from "@/components/ui/Button";
import { resolveApiError } from "@/lib/api/error-messages";

function KitViewer3DLoading() {
  const t = useTranslations("team");
  return (
    <div className="flex h-72 items-center justify-center text-xs uppercase tracking-widest text-text-muted lg:h-80">
      {t("jersey.loading3d")}
    </div>
  );
}

// KitViewer3D importe three.js — chargé uniquement ici, jamais depuis les
// composants de liste (JerseyBadge), via next/dynamic + ssr:false.
const KitViewer3D = dynamic(() => import("./KitViewer3D"), {
  ssr: false,
  loading: () => <KitViewer3DLoading />,
});

interface JerseyEditorProps {
  leagueId: string;
  initialName: string;
  initialConfig: JerseyConfig;
  onSaved: (result: { name: string; jerseyConfig: JerseyConfig }) => void;
}

function resizeColors(colors: string[], slots: number): string[] {
  if (colors.length === slots) return colors;
  if (colors.length > slots) return colors.slice(0, slots);
  const fallback = colors[colors.length - 1] ?? "#2DD4BF";
  return [...colors, ...Array(slots - colors.length).fill(fallback)];
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const t = useTranslations("team");
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {CURATED_JERSEY_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            className={`h-7 w-7 rounded-full transition-transform ${
              value.toLowerCase() === swatch.toLowerCase()
                ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                : "hover:scale-110"
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-text-muted hover:text-text"
          aria-label={t("jersey.customColor")}
        >
          +
        </button>
      </div>
      {customOpen && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            // input[type=color] exige une valeur hex minuscule stricte
            // (#rrggbb) — nos couleurs (DEFAULT_JERSEY_CONFIG, palette curatée)
            // sont en majuscules, sinon React lève "The string did not match
            // the expected pattern" en essayant de fixer la value du DOM.
            value={value.toLowerCase()}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
          />
          <input
            type="text"
            defaultValue={value}
            key={value}
            onChange={(e) => {
              const v = e.target.value;
              // Le state (et donc l'aperçu) n'est mis à jour qu'avec un hex
              // complet et valide — sinon la texture Canvas ignore
              // silencieusement les valeurs partielles et l'aperçu semble figé.
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
            }}
            maxLength={7}
            className="w-24 rounded border border-border bg-bg px-2 py-1 font-arcade text-sm uppercase tracking-wide text-text focus:border-accent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function PatternThumb({
  zoneName,
  patternId,
  colors,
}: {
  zoneName: KitZoneName;
  patternId: string;
  colors: string[];
}) {
  const pattern = getPattern(patternId);
  const clipId = `thumb-${zoneName}-${patternId}`;
  return (
    <svg viewBox="0 0 100 100" className="h-9 w-9" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={silhouetteToSvgPath(KIT_SILHOUETTES[zoneName])} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {pattern.regions.map((region, i) => (
          <polygon
            key={i}
            points={region.points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill={colors[region.slot] ?? colors[0] ?? "#666"}
          />
        ))}
      </g>
    </svg>
  );
}

export function JerseyEditor({ leagueId, initialName, initialConfig, onSaved }: JerseyEditorProps) {
  const t = useTranslations("team");
  const tLabels = useTranslations("labels");
  const tRoot = useTranslations();
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState<JerseyConfig>(initialConfig);
  const [activeZone, setActiveZone] = useState<KitZoneName>("jersey");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof JerseyConfig>(key: K, value: JerseyConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function setZonePattern(zoneName: KitZoneName, patternId: string) {
    setConfig((prev) => {
      const pattern = getPattern(patternId);
      const zone = prev[zoneName];
      return { ...prev, [zoneName]: { patternId, colors: resizeColors(zone.colors, pattern.slots) } };
    });
  }

  function setZoneColor(zoneName: KitZoneName, slot: number, hex: string) {
    setConfig((prev) => {
      const zone = prev[zoneName];
      const colors = [...zone.colors];
      colors[slot] = hex;
      return { ...prev, [zoneName]: { ...zone, colors } };
    });
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
        body: JSON.stringify({ leagueId, name: name.trim(), jerseyConfig: config }),
      });
      const data = (await res.json()) as {
        data?: { name: string; jerseyConfig: JerseyConfig };
        error?: { code?: string; message: string };
      };
      if (data.data) {
        onSaved(data.data);
      } else {
        setError(resolveApiError(tRoot, "team", data.error?.code));
        setSaving(false);
      }
    } catch {
      setError(resolveApiError(tRoot, "team", "NETWORK"));
      setSaving(false);
    }
  }

  const activeZoneConfig = config[activeZone];
  const activePattern = getPattern(activeZoneConfig.patternId);

  return (
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

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        {/* Aperçu 3D — avant les contrôles sur mobile pour un rendu immédiat */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-16">
          <div className="pixel-corners border border-border bg-surface p-2">
            <KitViewer3D config={config} className="h-72 w-full lg:h-80" />
          </div>
          <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-text-muted">
            {t("jersey.dragToRotate")}
          </p>
        </div>

        <div className="order-2 flex flex-col gap-5 lg:order-1">
          {/* Onglets zone */}
          <div className="flex gap-1">
            {KIT_ZONES.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => setActiveZone(zone)}
                className={`pixel-corners-sm flex-1 px-3 py-1.5 text-xs uppercase tracking-wide transition-colors ${
                  activeZone === zone
                    ? "bg-accent text-bg shadow-glow-accent"
                    : "border border-border text-text-muted"
                }`}
              >
                {tLabels(`kitZone.${zone}`)}
              </button>
            ))}
          </div>

          {/* Galerie de motifs de la zone active */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              {t("jersey.patternLabel")}
            </p>
            <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1">
              {KIT_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setZonePattern(activeZone, p.id)}
                  className={`pixel-corners-sm flex flex-col items-center gap-1 border p-1.5 text-[8px] uppercase tracking-wide transition-colors ${
                    activeZoneConfig.patternId === p.id
                      ? "border-accent text-accent shadow-glow-accent"
                      : "border-border text-text-muted"
                  }`}
                >
                  <PatternThumb zoneName={activeZone} patternId={p.id} colors={activeZoneConfig.colors} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Couleurs de la zone active — nombre de sélecteurs dépend du motif */}
          <div className="flex flex-col gap-4">
            {Array.from({ length: activePattern.slots }, (_, slot) => (
              <ColorPicker
                key={slot}
                label={t.has(`jersey.slotLabels.${slot}`) ? t(`jersey.slotLabels.${slot}`) : t("jersey.colorSlotFallback", { n: slot + 1 })}
                value={activeZoneConfig.colors[slot] ?? activeZoneConfig.colors[0] ?? "#2DD4BF"}
                onChange={(hex) => setZoneColor(activeZone, slot, hex)}
              />
            ))}
          </div>

          {/* Col / manches — spécifiques au maillot */}
          {activeZone === "jersey" && (
            <>
              <ColorPicker label={t("jersey.collarSleeveColor")} value={config.trimColor} onChange={(v) => set("trimColor", v)} />

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">{t("jersey.collarLabel")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {JERSEY_COLLARS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("collar", c)}
                      className={`pixel-corners-sm px-1.5 py-1.5 text-[9px] uppercase tracking-wide transition-colors ${
                        config.collar === c ? "border-accent text-accent shadow-glow-accent border" : "border border-border text-text-muted"
                      }`}
                    >
                      {tLabels(`jerseyCollar.${c}`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="pixel-corners-sm flex items-center justify-between border border-border bg-surface px-3 py-2.5">
                <span className="text-xs uppercase tracking-wide text-text-muted">{t("jersey.contrastSleeves")}</span>
                <input
                  type="checkbox"
                  checked={config.contrastSleeves}
                  onChange={(e) => set("contrastSleeves", e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
              </label>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">{t("jersey.numberLabel")}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => set("number", Math.max(0, config.number - 1))}
              className="pixel-corners-sm h-8 w-8 border border-border text-text-muted hover:text-text"
            >
              −
            </button>
            <span className="w-10 text-center font-arcade text-2xl tracking-wide text-text">{config.number}</span>
            <button
              type="button"
              onClick={() => set("number", Math.min(99, config.number + 1))}
              className="pixel-corners-sm h-8 w-8 border border-border text-text-muted hover:text-text"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">{t("jersey.nameFlockLabel")}</p>
          <input
            type="text"
            value={config.nameFlock}
            onChange={(e) => set("nameFlock", e.target.value.toUpperCase().slice(0, 12))}
            maxLength={12}
            placeholder={t("jersey.nameFlockPlaceholder")}
            className="pixel-corners w-full border border-border bg-surface px-3 py-2 text-sm uppercase text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="text-center text-sm text-points-neg">{error}</p>}
      <Button onClick={handleSubmit} disabled={saving} variant="primary" size="lg" className="w-full">
        {saving ? t("jersey.saving") : t("jersey.submitCta")}
      </Button>
    </div>
  );
}
