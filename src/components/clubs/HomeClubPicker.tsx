"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { countryOptions, countryFlag } from "@/lib/geo/countries";

// Club d'origine d'un membre — ARCHITECTURE.md §23.6. Composant contrôlé, réutilisé
// à l'inscription et sur /account. Le parent traduit la valeur en payload API :
//   { kind: "existing" } -> { clubId }
//   { kind: "new" }      -> { newClub: { name, country, city } }
//   null                 -> null (retire le club)
export type HomeClubValue =
  | {
      kind: "existing";
      club: { id: string; name: string; city: string | null; country: string; verified?: boolean };
    }
  | { kind: "new"; name: string; country: string; city?: string }
  | null;

interface ClubHit {
  id: string;
  name: string;
  city: string | null;
  zipcode: string | null;
  country: string;
}

function valueCountry(v: HomeClubValue): string | null {
  if (v === null) return null;
  return v.kind === "existing" ? v.club.country : v.country;
}

export function HomeClubPicker({
  value,
  onChange,
}: {
  value: HomeClubValue;
  onChange: (v: HomeClubValue) => void;
}) {
  const t = useTranslations("community");
  const locale = useLocale();

  const [country, setCountry] = useState(valueCountry(value) ?? "FR");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClubHit[]>([]);
  const [open, setOpen] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeCity, setFreeCity] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Liste des pays construite côté client uniquement : `Intl.DisplayNames` ne rend
  // pas exactement les mêmes libellés (ni le même tri) selon l'ICU du serveur Node
  // et celui du navigateur → mismatch d'hydratation si on la calcule au render SSR.
  const [countries, setCountries] = useState<ReturnType<typeof countryOptions>>([]);
  useEffect(() => {
    setCountries(countryOptions(locale));
  }, [locale]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Recherche serveur débouncée (l'annuaire ~2300+ lignes ne se charge pas côté client).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/handball-clubs?q=${encodeURIComponent(q)}&country=${country}&limit=10`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((j: { data?: { clubs: ClubHit[] } }) => setHits(j.data?.clubs ?? []))
        .catch(() => {
          /* abort / réseau — on laisse la liste en l'état */
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, country]);

  const clear = useCallback(() => {
    onChange(null);
    setQuery("");
    setFreeMode(false);
    setFreeName("");
    setFreeCity("");
  }, [onChange]);

  // --- Club déjà choisi : chip + bouton changer -------------------------------
  if (value) {
    const label =
      value.kind === "existing"
        ? `${value.club.name}${value.club.city ? ` · ${value.club.city}` : ""}`
        : `${value.name}${value.city ? ` · ${value.city}` : ""}`;
    const pending = value.kind === "existing" ? value.club.verified === false : true;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-4 py-2.5">
          <span className="text-text">
            {countryFlag(valueCountry(value) ?? "")} {label}
          </span>
          <button type="button" onClick={clear} className="shrink-0 text-xs text-text-muted hover:text-text">
            {t("homeClub.change")}
          </button>
        </div>
        {pending && <p className="text-[11px] text-text-muted">{t("homeClub.pendingReview")}</p>}
      </div>
    );
  }

  // --- Saisie libre ----------------------------------------------------------
  if (freeMode) {
    const canSubmit = freeName.trim().length >= 2;
    return (
      <div className="flex flex-col gap-2">
        <CountrySelect countries={countries} value={country} onChange={setCountry} label={t("homeClub.countryLabel")} />
        <input
          type="text"
          value={freeName}
          onChange={(e) => setFreeName(e.target.value)}
          maxLength={120}
          placeholder={t("homeClub.freeName")}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
        />
        <input
          type="text"
          value={freeCity}
          onChange={(e) => setFreeCity(e.target.value)}
          maxLength={120}
          placeholder={t("homeClub.freeCity")}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFreeMode(false)}
            className="text-xs text-text-muted hover:text-text"
          >
            {t("homeClub.backToSearch")}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onChange({
                kind: "new",
                name: freeName.trim(),
                country,
                city: freeCity.trim() || undefined,
              })
            }
            className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
          >
            {t("homeClub.freeSubmit")}
          </button>
        </div>
      </div>
    );
  }

  // --- Recherche annuaire --------------------------------------------------
  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <CountrySelect countries={countries} value={country} onChange={setCountry} label={t("homeClub.countryLabel")} />
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("homeClub.searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-text placeholder-text-muted outline-none focus:border-accent"
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {hits.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-text-muted">{t("homeClub.noResults")}</p>
            ) : (
              hits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange({ kind: "existing", club: { ...c, verified: true } });
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-text transition-colors hover:bg-accent/10"
                >
                  <span>{c.name}</span>
                  {c.city && <span className="shrink-0 text-xs text-text-muted">{c.city}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setFreeMode(true)}
        className="self-start text-xs text-accent hover:underline"
      >
        {t("homeClub.notListed")}
      </button>
    </div>
  );
}

function CountrySelect({
  countries,
  value,
  onChange,
  label,
}: {
  countries: { code: string; name: string; flag: string }[];
  value: string;
  onChange: (code: string) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-widest text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
      >
        {countries.length === 0 ? (
          // Avant que la liste localisée soit chargée (client-only, cf. plus haut) :
          // une seule option déterministe pour rester cohérent SSR/hydratation.
          <option value={value}>{countryFlag(value)} {value}</option>
        ) : (
          countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

// Traduit une HomeClubValue en payload pour le champ `homeClub` de l'API
// (PUT /api/account, POST /api/auth/register). `undefined` = ne pas toucher.
export function homeClubValueToPayload(
  value: HomeClubValue,
): { clubId: string } | { newClub: { name: string; country: string; city?: string } } | null {
  if (value === null) return null;
  if (value.kind === "existing") return { clubId: value.club.id };
  return { newClub: { name: value.name, country: value.country, city: value.city } };
}
