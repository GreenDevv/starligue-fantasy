import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { league?: string };
}) {
  const tLabels = await getTranslations("labels");
  const t = await getTranslations("team");
  const format = await getFormatter();
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return null;
  }

  const userId = session.user.id;
  const mode = resolveSeasonMode();
  const ctx = await resolveActiveTeamContext(userId, mode, searchParams.league);
  if (!ctx) {
    redirect({ href: "/leagues", locale: params.locale });
    return null;
  }

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: ctx.teamId },
          select: { id: true, name: true, totalPoints: true },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: ctx.teamId },
          select: { id: true, name: true, totalPoints: true },
        });
  if (!team) {
    redirect({ href: "/leagues", locale: params.locale });
    return null;
  }

  const lineups =
    mode === "simulation"
      ? await prisma.simulationLineup.findMany({
          where: { simulationTeamId: team.id },
          include: { gameweek: { select: { number: true, deadlineAt: true, isScored: true } } },
          orderBy: { gameweek: { number: "desc" } },
        })
      : await prisma.fantasyLineup.findMany({
          where: { fantasyTeamId: team.id },
          include: { gameweek: { select: { number: true, deadlineAt: true, isScored: true } } },
          orderBy: { gameweek: { number: "desc" } },
        });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href={`/leagues/${ctx.leagueId}`} className="text-text-muted hover:text-text text-sm transition-colors">
          ← {t("common.backToTeam")}
        </Link>
      </div>

      <div>
        {mode === "simulation" && (
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-secondary">
            {t("common.simulationModeSeason")}
          </p>
        )}
        <h1 className="text-2xl text-text">{t("history.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {mode === "live"
            ? t("history.teamSummarySeason", { name: team.name, points: Number(team.totalPoints) })
            : t("history.teamSummary", { name: team.name, points: Number(team.totalPoints) })}
        </p>
      </div>

      {lineups.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
          <p className="text-text-muted">
            {mode === "simulation" ? t("history.emptySim") : t("history.emptyLive")}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {mode === "simulation" ? t("history.emptyHintSim") : t("history.emptyHintLive")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden pixel-corners border border-border bg-surface">
          <div className="divide-y divide-border">
            {lineups.map((l) => {
              const pts = l.points !== null ? Number(l.points) : null;
              // En simulation, "scored" = ce lineup a déjà des points (chaque équipe
              // avance à son rythme tant que l'avancée n'est pas globale, étape 6).
              const isScored = mode === "simulation" ? pts !== null : l.gameweek.isScored;
              return (
                <Link
                  key={l.id}
                  href={`/team/history/${l.gameweekId}?league=${ctx.leagueId}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-border/20"
                >
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-text">
                      {t("common.matchday", { number: l.gameweek.number })}
                      {l.bonus && (
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-accent-secondary">
                          {tLabels(`bonus.${l.bonus}`)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-muted">
                      {format.dateTime(new Date(l.gameweek.deadlineAt), {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    {isScored && pts !== null ? (
                      <p
                        className={`font-arcade text-2xl leading-none ${
                          pts >= 0 ? "text-points-pos drop-shadow-[0_0_6px_currentColor]" : "text-points-neg drop-shadow-[0_0_6px_currentColor]"
                        }`}
                      >
                        {pts > 0 ? `+${pts}` : pts}
                      </p>
                    ) : (
                      <p className="text-sm text-text-muted">{t("history.pending")}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-text-muted">{t("history.ptsArrow")}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
