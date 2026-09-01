// Détail d'une équipe du classement général : décomposition journée par journée
// entre points d'effectif et apport des pronostics (ARCHITECTURE.md §14). LIVE
// uniquement — voir src/lib/leaderboard/team-breakdown.ts.
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFantasyTeamBreakdown } from "@/lib/leaderboard/team-breakdown";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";

export default async function TeamBreakdownPage({
  params,
}: {
  params: { teamId: string; locale: string };
}) {
  const t = await getTranslations("leaderboard");
  const tLabels = await getTranslations("labels");
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return null;
  }

  const team = await getFantasyTeamBreakdown(params.teamId);
  if (!team) notFound();

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
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          {/* En-têtes — masqués sur mobile, chaque ligne reste lisible seule */}
          <div className="hidden grid-cols-[3.5rem_1fr_1fr_1fr] gap-2 border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest text-text-muted sm:grid">
            <span>{t("team.col.gameweek")}</span>
            <span className="text-right">{t("team.col.squad")}</span>
            <span className="text-right">{t("team.col.predictions")}</span>
            <span className="text-right">{t("team.col.total")}</span>
          </div>
          <div className="divide-y divide-border">
            {[...team.gameweeks].reverse().map((gw) => (
              <div
                key={gw.gameweekId}
                className="grid grid-cols-2 gap-x-2 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[3.5rem_1fr_1fr_1fr] sm:items-center"
              >
                <span className="font-arcade text-base text-text-muted sm:text-sm">
                  {t("gameweekLabel", { number: gw.gameweekNumber })}
                </span>

                {gw.bonus && (
                  <span className="col-span-2 text-[10px] uppercase tracking-widest text-accent-secondary sm:col-span-1 sm:order-last sm:hidden">
                    {tLabels(`bonus.${gw.bonus}`)}
                  </span>
                )}

                <span className="text-right tabular-nums text-text sm:text-right">
                  {gw.rawPoints !== null ? (
                    gw.rawPoints > 0 ? `+${gw.rawPoints}` : gw.rawPoints
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </span>

                <span
                  className={`text-right tabular-nums sm:text-right ${
                    gw.predictionDelta === null
                      ? "text-text-muted"
                      : gw.predictionDelta > 0
                        ? "text-points-pos"
                        : gw.predictionDelta < 0
                          ? "text-points-neg"
                          : "text-text-muted"
                  }`}
                >
                  {gw.predictionDelta !== null
                    ? gw.predictionDelta > 0
                      ? `+${gw.predictionDelta}`
                      : gw.predictionDelta
                    : "—"}
                </span>

                <span
                  className={`text-right font-semibold tabular-nums sm:text-right ${
                    gw.points > 0 ? "text-points-pos" : gw.points < 0 ? "text-points-neg" : "text-text-muted"
                  }`}
                >
                  {gw.points > 0 ? `+${gw.points}` : gw.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
