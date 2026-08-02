"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { UnifiedMatch } from "@/components/clubs/ClubMatchesPanel";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// Bornes de navigation : du premier mois avec un match au dernier, en incluant
// TOUJOURS le mois en cours (même sans aucun match dedans) — sinon "aujourd'hui"
// pourrait tomber hors de la plage navigable (ex: tous les matchs filtrés sont à
// venir, mois courant absent de la liste) et le mois initial (voir plus bas) ne
// serait pas atteignable en arrière.
function monthRange(matches: UnifiedMatch[]): { first: Date; last: Date } {
  const today = startOfMonth(new Date());
  const times = matches.map((m) => startOfMonth(m.kickoffAt).getTime());
  times.push(today.getTime());
  return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
}

function outcomeToneClasses(m: UnifiedMatch): string {
  if (m.ownScore === null || m.opponentScore === null) return "border-accent/50 bg-accent/5";
  if (m.ownScore > m.opponentScore) return "border-points-pos/60 bg-points-pos/10";
  if (m.ownScore < m.opponentScore) return "border-points-neg/60 bg-points-neg/10";
  return "border-accent-secondary/60 bg-accent-secondary/10";
}

// 1er janvier 2024 = un lundi — ancre pratique pour dériver les 7 abréviations de
// jour localisées (via Intl, donc correctes dans les 8 langues du site) sans
// dupliquer une table de traduction dédiée.
const MONDAY_ANCHOR = new Date(2024, 0, 1);

// Vue calendrier mensuel — résultats ET prochains matchs (championnat + Warm Up +
// Coupe de France) fusionnés, demande explicite de l'utilisateur ("mets les
// résultats aussi dans le calendrier") plutôt qu'un calendrier limité aux matchs à
// venir. Teinte par résultat (victoire/défaite/nul/à venir) + badge de nomenclature
// par compétition sur chaque jour joué — voir la légende dans ClubMatchesPanel, qui
// utilise exactement les mêmes couleurs/codes. Navigation mois par mois bornée à
// [premier mois avec un match ou le mois courant ; dernier mois avec un match ou le
// mois courant].
export function ClubMatchesCalendar({ matches }: { matches: UnifiedMatch[] }) {
  const t = useTranslations("matches");
  const format = useFormatter();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const { first, last } = useMemo(() => monthRange(matches), [matches]);
  const canGoPrev = month > first;
  const canGoNext = month < last;

  const byDay = useMemo(() => {
    const map = new Map<number, UnifiedMatch[]>();
    for (const m of matches) {
      if (!isSameMonth(m.kickoffAt, month)) continue;
      const day = m.kickoffAt.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    return map;
  }, [matches, month]);

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(MONDAY_ANCHOR);
        d.setDate(MONDAY_ANCHOR.getDate() + i);
        return format.dateTime(d, { weekday: "short" });
      }),
    [format]
  );

  const firstWeekday = (startOfMonth(month).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const monthLabel = format.dateTime(month, { month: "long", year: "numeric" });

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
          aria-label={t("panel.calendarPrevMonth")}
          className="rounded-[3px] px-2 py-1 text-text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          ‹
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
          aria-label={t("panel.calendarNextMonth")}
          className="rounded-[3px] px-2 py-1 text-text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((w, i) => (
          <div key={i} className="text-center text-[9px] uppercase tracking-wide text-text-muted">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dayMatches = byDay.get(day) ?? [];
          const tone = dayMatches.length > 0 ? outcomeToneClasses(dayMatches[0]!) : "border-border/40";
          return (
            <div
              key={day}
              className={`relative flex min-h-[52px] sm:min-h-[64px] flex-col items-center gap-1 rounded-md border p-1 ${tone}`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[10px] text-text-muted">{day}</span>
                {dayMatches.length > 0 && (
                  <span className="text-[7px] font-semibold uppercase leading-none tracking-wide text-text-muted/80">
                    {dayMatches[0]!.badge}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-0.5">
                {dayMatches.map((m) =>
                  m.href ? (
                    <Link key={m.id} href={m.href}>
                      <ClubLogo club={m.opponent} size="sm" title={m.tooltip} largeOnDesktop />
                    </Link>
                  ) : (
                    <ClubLogo key={m.id} club={m.opponent} size="sm" title={m.tooltip} largeOnDesktop />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {byDay.size === 0 && <p className="mt-3 text-center text-xs text-text-muted">{t("panel.calendarNoMatches")}</p>}
    </div>
  );
}
