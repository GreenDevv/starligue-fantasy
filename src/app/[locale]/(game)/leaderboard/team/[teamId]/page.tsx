// Détail d'une équipe du classement général : décomposition journée par journée
// entre points d'effectif et apport des pronostics (ARCHITECTURE.md §14), avec
// historique de progression et détail au niveau joueur. LIVE uniquement — voir
// src/lib/leaderboard/team-breakdown.ts.
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFantasyTeamBreakdown } from "@/lib/leaderboard/team-breakdown";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";
import { TeamProgressionChart } from "@/components/leaderboard/TeamProgressionChart";
import { TeamGameweekAccordion } from "@/components/leaderboard/TeamGameweekAccordion";

export default async function TeamBreakdownPage({
  params,
}: {
  params: { teamId: string; locale: string };
}) {
  const t = await getTranslations("leaderboard");
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return null;
  }

  const team = await getFantasyTeamBreakdown(params.teamId);
  if (!team) notFound();

  // Le graphique de progression ne peut tracer que les journées avec détail
  // persisté (rawPoints non nul) — voir scripts/backfill-lineup-prediction-breakdown.ts
  // pour les journées jouées avant l'introduction de ce détail.
  const chartEntries = team.gameweeks
    .filter((gw): gw is typeof gw & { rawPoints: number; predictionDelta: number } => gw.rawPoints !== null && gw.predictionDelta !== null)
    .map((gw) => ({
      gameweekNumber: gw.gameweekNumber,
      rawPoints: gw.rawPoints,
      predictionDelta: gw.predictionDelta,
      points: gw.points,
    }));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/leaderboard" className="text-sm text-text-muted transition-colors hover:text-text">
        ← {t("title")}
      </Link>

      <div className="flex items-center gap-3">
        <JerseyBadge jerseyConfig={team.jerseyConfig} size="md" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl text-text">{team.teamName}</h1>
          <p className="truncate text-sm text-text-muted">{team.userName}</p>
        </div>
        <div className="text-right">
          {team.rank !== null && (
            <p className="text-xs uppercase tracking-widest text-text-muted">{t("team.rank", { rank: team.rank })}</p>
          )}
          <p className="font-arcade text-2xl tabular-nums text-accent drop-shadow-[0_0_8px_currentColor]">
            {team.totalPoints}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-muted">{t("team.subtitle")}</p>

      {team.gameweeks.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm text-text-muted">{t("team.noHistory")}</p>
        </div>
      ) : (
        <>
          {chartEntries.length > 0 && (
            <div className="pixel-corners border border-border bg-surface p-3">
              <TeamProgressionChart entries={chartEntries} />
            </div>
          )}

          <p className="text-[11px] text-text-muted">{t("team.expandHint")}</p>

          <TeamGameweekAccordion teamId={team.teamId} gameweeks={team.gameweeks} />
        </>
      )}
    </div>
  );
}
