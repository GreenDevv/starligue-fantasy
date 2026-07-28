"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface MyLeagueRow {
  id: string;
  name: string;
  myRank: number;
  myPoints: number;
  memberCount: number;
}

export function LeaderboardLeaguesWidget({ leagues }: { leagues: MyLeagueRow[] }) {
  const t = useTranslations("dashboard");
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">{t("leaguesWidget.title")}</p>
        {leagues.length > 0 && (
          <Link href="/leagues" className="text-[10px] text-text-muted transition-colors hover:text-text">
            {t("leaguesWidget.seeAll")}
          </Link>
        )}
      </div>
      {leagues.length === 0 ? (
        // CTA volontairement discret ici (lien, pas de bouton plein) — celui du
        // bandeau de statut en haut de page porte déjà cette action en avant.
        <p className="py-4 text-center text-xs text-text-muted">
          {t("leaguesWidget.noLeagues")}{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            {t("leaguesWidget.joinLeague")}
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {leagues.map((l) => (
            <Link
              key={l.id}
              href={`/leagues/${l.id}`}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-border/20"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{l.name}</p>
                <p className="truncate text-[10px] text-text-muted">
                  {t("leaguesWidget.memberCount", { count: l.memberCount })}
                </p>
              </div>
              <span className="shrink-0 text-xs text-text-muted">#{l.myRank}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{l.myPoints}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
