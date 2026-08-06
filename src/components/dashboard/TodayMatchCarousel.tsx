"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { TodayMatchRow, TodayCompetitionKey } from "@/lib/matches/get-today-matches";

const COMPETITION_LABEL_KEY: Record<TodayCompetitionKey, string> = {
  championship: "todayMatches.championship",
  warmup: "warmup.title",
  coupeDeFrance: "coupeDeFrance.title",
  championsLeague: "championsLeague.title",
  europeanLeague: "europeanLeague.title",
};

const ROTATE_MS = 4500;

// Badge "Jour de match" en haut à droite du hero de la home (demande explicite de
// l'utilisateur, 2026-08-06) — toutes compétitions confondues (voir
// src/lib/matches/get-today-matches.ts), défile automatiquement s'il y a plusieurs
// matchs aujourd'hui. Absent du DOM (return null) s'il n'y en a aucun — pas de
// contenu vide à afficher, contrairement aux strips MatchesStrip qui ont un état
// "aucun match" explicite (ceux-là restent visibles en permanence dans la
// colonne matchs, ce badge n'a de raison d'exister que les jours avec match).
export function TodayMatchCarousel({ matches }: { matches: TodayMatchRow[] }) {
  const t = useTranslations("dashboard");
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

  const body = (
    <div className="flex flex-col items-center gap-1.5 px-4 py-2">
      <div className="flex items-center gap-2">
        <ClubLogo club={m.homeClub} size="sm" title={m.homeClub.division ? `${m.homeClub.name} (${m.homeClub.division})` : undefined} />
        {hasScore ? (
          <span className="font-arcade text-base leading-none tracking-wide text-text">
            {m.homeScore}-{m.awayScore}
          </span>
        ) : (
          <span className="text-[10px] uppercase text-text-muted">vs</span>
        )}
        <ClubLogo club={m.awayClub} size="sm" title={m.awayClub.division ? `${m.awayClub.name} (${m.awayClub.division})` : undefined} />
      </div>
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-text-muted">
        <span>{t(COMPETITION_LABEL_KEY[m.competitionKey])}</span>
        <span>·</span>
        <span>
          {hasScore ? t("todayMatches.finished") : format.dateTime(new Date(m.kickoffAt), { hour: "2-digit", minute: "2-digit" })}
        </span>
      </p>
    </div>
  );

  return (
    <div className="pixel-corners shadow-glow-amber flex w-full flex-col items-center border border-accent-secondary/50 bg-accent-secondary/10 sm:w-64">
      <div className="flex items-center gap-1.5 pt-2">
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
        <div className="flex gap-1 pb-2">
          {matches.map((mm, i) => (
            <span
              key={mm.id}
              className={`h-1 w-1 rounded-full ${i === index ? "bg-accent-secondary" : "bg-border"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
