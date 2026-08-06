"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { TodayMatchRow, TodayCompetitionKey } from "@/lib/matches/get-today-matches";

// Réutilise les abréviations déjà traduites pour /clubs (ClubMatchesPanel, namespace
// "matches") plutôt que d'en recréer — même convention visuelle (WU/CDF/CL/EL),
// zéro nouvelle clé i18n. Libellé complet à part, pour le tooltip uniquement.
const COMPETITION_SHORT_KEY: Record<TodayCompetitionKey, string> = {
  championship: "panel.competitionStarligue",
  warmup: "panel.competitionShortWarmup",
  coupeDeFrance: "panel.competitionShortCoupe",
  championsLeague: "panel.competitionShortChampionsLeague",
  europeanLeague: "panel.competitionShortEuropeanLeague",
};

const COMPETITION_FULL_KEY: Record<TodayCompetitionKey, string> = {
  championship: "panel.competitionStarligue",
  warmup: "panel.competitionWarmup",
  coupeDeFrance: "panel.competitionCoupeDeFrance",
  championsLeague: "panel.competitionChampionsLeague",
  europeanLeague: "panel.competitionEuropeanLeague",
};

const ROTATE_MS = 4500;

// Badge "Jour de match" en haut à droite du hero de la home (demande explicite de
// l'utilisateur, 2026-08-06) — toutes compétitions confondues (voir
// src/lib/matches/get-today-matches.ts), défile automatiquement s'il y a plusieurs
// matchs aujourd'hui. Absent du DOM (return null) s'il n'y en a aucun — pas de
// contenu vide à afficher, contrairement aux strips MatchesStrip qui ont un état
// "aucun match" explicite (ceux-là restent visibles en permanence dans la
// colonne matchs, ce badge n'a de raison d'exister que les jours avec match).
//
// Largeur : pleine largeur jusqu'à lg: (comme tout le reste sur mobile), puis
// alignée sur celle de la colonne "prochains matchs"/tiroirs (300px, cf. le grid
// template de page.tsx) une fois le layout 3 colonnes actif — demande explicite,
// 2026-08-06 (le badge paraissait plus étroit que les autres cartes en mobile).
export function TodayMatchCarousel({ matches }: { matches: TodayMatchRow[] }) {
  const t = useTranslations("dashboard");
  const tMatches = useTranslations("matches");
  const format = useFormatter();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (matches.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % matches.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [matches.length]);

  if (matches.length === 0) return null;

  const m = matches[index % matches.length]!;
  const hasScore = m.homeScore !== null && m.awayScore !== null;

  // Tooltip toujours renseigné (pas seulement pour les clubs hors DB) — même
  // format 2 lignes que ClubMatchesPanel ("compétition\nclub (division)") : utile
  // dès qu'un adversaire Warm Up/Coupe de France est hors Starligue (D2/étranger),
  // demande explicite de l'utilisateur.
  function clubTitle(club: TodayMatchRow["homeClub"]): string {
    const competition = tMatches(COMPETITION_FULL_KEY[m.competitionKey]);
    const name = club.division ? `${club.name} (${club.division})` : club.name;
    return `${competition}\n${name}`;
  }

  // Logos + compétition/heure côte à côte (pas empilés) : la carte est maintenant
  // pleine largeur (voir plus bas), autant utiliser cet espace horizontal plutôt
  // que de faire grandir la hauteur — demande explicite de l'utilisateur,
  // 2026-08-06 ("la div est trop grande en hauteur" après l'agrandissement des
  // logos/de la largeur).
  const body = (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <ClubLogo club={m.homeClub} size="lg" largeOnDesktop title={clubTitle(m.homeClub)} />
        {hasScore ? (
          <span className="font-arcade text-lg leading-none tracking-wide text-text">
            {m.homeScore}-{m.awayScore}
          </span>
        ) : (
          <span className="text-xs uppercase text-text-muted">vs</span>
        )}
        <ClubLogo club={m.awayClub} size="lg" largeOnDesktop title={clubTitle(m.awayClub)} />
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right text-xs uppercase leading-tight tracking-wide text-text-muted">
        <span>{tMatches(COMPETITION_SHORT_KEY[m.competitionKey])}</span>
        <span>
          {hasScore ? t("todayMatches.finished") : format.dateTime(new Date(m.kickoffAt), { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );

  return (
    <div className="pixel-corners shadow-glow-amber flex w-full flex-col items-center border border-accent-secondary/50 bg-accent-secondary/10 lg:w-[300px]">
      <div className="flex items-center gap-1.5 pt-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-secondary" />
        <p className="font-arcade text-xs uppercase tracking-[0.25em] text-accent-secondary">{t("todayMatches.badgeTitle")}</p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={m.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.25 }}
        >
          {m.href ? (
            <Link href={m.href} className="block hover:opacity-80">
              {body}
            </Link>
          ) : (
            body
          )}
        </motion.div>
      </AnimatePresence>

      {matches.length > 1 && (
        <div className="flex gap-1.5 pb-1.5">
          {matches.map((mm, i) => (
            <span
              key={mm.id}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-accent-secondary" : "bg-border"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
