"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";

interface CalendarEntry {
  id: string;
  kickoffAt: Date;
  opponent: { shortName: string; name: string; logoUrl: string | null };
  href: string | null;
  tooltip: string;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// 1er janvier 2024 = un lundi — ancre pratique pour dériver les 7 abréviations de
// jour localisées (via Intl, donc correctes dans les 8 langues du site) sans
// dupliquer une table de traduction dédiée.
const MONDAY_ANCHOR = new Date(2024, 0, 1);

// Vue calendrier mensuel des prochains matchs (championnat + Warm Up fusionnés,
// cf. ClubMatchesPanel) — demande explicite de l'utilisateur plutôt qu'une simple
// liste. Navigation mois par mois bornée à [mois du jour ; mois du dernier match] :
// tous les matchs passés en argument sont par construction à venir (>= aujourd'hui),
// donc naviguer plus loin ne montrerait jamais que des mois vides.
export function ClubMatchesCalendar({ matches }: { matches: CalendarEntry[] }) {
  const t = useTranslations("matches");
  const format = useFormatter();

  const today = useMemo(() => startOfMonth(new Date()), []);
  const initialMonth = matches.length > 0 ? startOfMonth(matches[0]!.kickoffAt) : today;
  const [month, setMonth] = useState(initialMonth);

  const lastMonth = matches.length > 0 ? startOfMonth(matches[matches.length - 1]!.kickoffAt) : today;
  const canGoPrev = month > today;
  const canGoNext = month < lastMonth;

  const byDay = useMemo(() => {
    const map = new Map<number, CalendarEntry[]>();
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
          return (
            <div
              key={day}
              className={`flex min-h-[52px] sm:min-h-[64px] flex-col items-center gap-1 rounded-md border p-1 ${
                dayMatches.length > 0 ? "border-accent/50 bg-accent/5" : "border-border/40"
              }`}
            >
              <span className="text-[10px] text-text-muted">{day}</span>
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
