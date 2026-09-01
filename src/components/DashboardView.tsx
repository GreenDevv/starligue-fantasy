"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import {
  DEFAULT_LAYOUT,
  SINGLETON_WIDGETS,
  defaultSizeForType,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardWidget,
  type WidgetSize,
} from "@/lib/dashboard/layout";
import { DashboardWidgetShell } from "@/components/DashboardWidgetShell";
import { StatLeaderCard } from "@/components/dashboard/StatLeaderCard";
import { MatchesStrip } from "@/components/dashboard/MatchesStrip";
import { LeaderboardGlobalWidget, type GlobalStandingRow } from "@/components/dashboard/widgets/LeaderboardGlobalWidget";
import { LeaderboardLeaguesWidget, type MyLeagueRow } from "@/components/dashboard/widgets/LeaderboardLeaguesWidget";
import { BestXIWidget } from "@/components/dashboard/widgets/BestXIWidget";
import { ClubStandingsWidget } from "@/components/dashboard/widgets/ClubStandingsWidget";
import { HomeClubsMapWidget } from "@/components/dashboard/widgets/HomeClubsMapWidget";
import { ClubFantasyRankingWidget } from "@/components/dashboard/widgets/ClubFantasyRankingWidget";
import type { DashboardStrips } from "@/lib/matches/dashboard-strips";
import type { BestXIEntry } from "@/lib/players/compute-best-xi";
import type { ClubStandingsResult } from "@/lib/standings/get";
import type { HomeClubsAggregate } from "@/lib/community/home-clubs";
import type { ClubFantasyRankingRow } from "@/lib/community/club-fantasy-ranking";
import { SimulationGameweekControls, type SimulationAdminControls } from "@/components/dashboard/SimulationGameweekControls";
import { GameweekRecapModal } from "@/components/dashboard/GameweekRecapModal";
import type { PendingGameweekRecap } from "@/lib/team/pending-gameweek-recap";
import type { SeasonMode } from "@/lib/team/active-team-context";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  seasonId: string;
  userName: string | null;
  hasLeagues: boolean;
  setupLeagueId: string | null;
  standings: GlobalStandingRow[];
  leagues: MyLeagueRow[];
  dashboardStrips: DashboardStrips;
  bestXI: BestXIEntry[];
  clubStandings: ClubStandingsResult;
  homeClubsAggregate: HomeClubsAggregate;
  clubFantasyRanking: ClubFantasyRankingRow[];
  locale: string;
  // Détail par journée (effectif vs pronostics) du classement général — LIVE
  // uniquement, voir /leaderboard/team/[teamId].
  mode: SeasonMode;
  simulationAdmin: SimulationAdminControls | null;
  pendingRecaps: PendingGameweekRecap[];
}

// mini = 1 colonne (compact), square = 2 colonnes (grand carré), wide = pleine
// largeur (bande longue) — grille dense pour que les widgets plus petits comblent
// les trous laissés par les plus grands plutôt que de tout pousser en dessous.
const SIZE_SPAN_CLASS: Record<WidgetSize, string> = {
  mini: "col-span-1",
  square: "col-span-2",
  wide: "col-span-2 sm:col-span-4",
};

export function DashboardView({
  seasonId,
  userName,
  hasLeagues,
  setupLeagueId,
  standings,
  leagues,
  dashboardStrips,
  bestXI,
  clubStandings,
  homeClubsAggregate,
  clubFantasyRanking,
  locale,
  mode,
  simulationAdmin,
  pendingRecaps,
}: DashboardViewProps) {
  const t = useTranslations("dashboard");
  const tLabels = useTranslations("labels");
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_LAYOUT);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showStatPicker, setShowStatPicker] = useState(false);

  useEffect(() => {
    setWidgets(loadDashboardLayout());
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function persist(next: DashboardWidget[]) {
    setWidgets(next);
    saveDashboardLayout(next);
  }

  function removeWidget(id: string) {
    persist(widgets.filter((w) => w.id !== id));
  }

  function resizeWidget(id: string, size: WidgetSize) {
    persist(widgets.map((w) => (w.id === id ? { ...w, size } : w)));
  }

  function addSingleton(type: (typeof SINGLETON_WIDGETS)[number]["type"]) {
    persist([...widgets, { id: type, type, size: defaultSizeForType(type) }]);
    setShowAddPanel(false);
  }

  function addStatWidget(statKey: string) {
    persist([
      ...widgets,
      { id: crypto.randomUUID(), type: "player-stats", statKey, size: defaultSizeForType("player-stats") },
    ]);
    setShowStatPicker(false);
    setShowAddPanel(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    persist(arrayMove(widgets, oldIndex, newIndex));
  }

  const missingSingletons = SINGLETON_WIDGETS.filter((s) => !widgets.some((w) => w.type === s.type));

  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const nextGameweekNumber = dashboardStrips.upcoming.gameweekNumber;

  // Une seule action mise en avant à la fois — la prochaine étape la plus utile
  // dans le parcours (rejoindre une ligue → construire l'effectif → prêt), plutôt
  // que d'empiler plusieurs bandeaux. Le compte à rebours de deadline reste dans
  // le DeadlineBanner global (layout), pas dupliqué ici.
  const status: { text: string; cta: { label: string; href: string } | null; tone: "action" | "calm" } = !hasLeagues
    ? {
        text: t("dashboardView.status.noLeague"),
        cta: { label: t("dashboardView.status.joinLeagueCta"), href: "/leagues" },
        tone: "action",
      }
    : setupLeagueId
      ? {
          text: t("dashboardView.status.squadNotValidated"),
          cta: { label: t("dashboardView.status.buildSquadCta"), href: `/team/build?league=${setupLeagueId}` },
          tone: "action",
        }
      : {
          text: nextGameweekNumber
            ? t("dashboardView.status.readyWithGameweek", { number: nextGameweekNumber })
            : t("dashboardView.status.readyForSeason"),
          cta: null,
          tone: "calm",
        };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <GameweekRecapModal recaps={pendingRecaps} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl text-text">{t("page.title")}</h1>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs uppercase tracking-widest text-accent hover:underline">
            {t("dashboardView.newsLink")}
          </Link>
          {simulationAdmin && <SimulationGameweekControls controls={simulationAdmin} />}
        </div>
      </div>

      {/* Statut perso — une seule ligne, une seule action à la fois */}
      <div
        className={cn(
          "pixel-corners flex flex-col gap-2.5 border p-4 sm:flex-row sm:items-center sm:justify-between",
          status.tone === "action" ? "border-accent/40 bg-accent/5 shadow-glow-accent" : "border-border bg-surface"
        )}
      >
        <p className="text-sm text-text-muted">
          <span className="text-text">
            {firstName ? t("dashboardView.status.greeting", { name: firstName }) : t("dashboardView.status.greetingGuest")}
          </span>{" "}
          — {status.text}
        </p>
        {status.cta && (
          <Link
            href={status.cta.href}
            className="pixel-corners-sm shrink-0 bg-accent px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent/90"
          >
            {status.cta.label} →
          </Link>
        )}
      </div>

      <DndContext id="dashboard-widgets" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 [grid-auto-flow:dense] [grid-auto-rows:min-content] sm:grid-cols-4">
            {widgets.map((w) => (
              <DashboardWidgetShell
                key={w.id}
                id={w.id}
                size={w.size}
                onSizeChange={(size) => resizeWidget(w.id, size)}
                onRemove={() => removeWidget(w.id)}
                showRemove={w.type !== "player-stats"}
                className={SIZE_SPAN_CLASS[w.size]}
              >
                {renderWidget(w, {
                  seasonId,
                  standings,
                  leagues,
                  dashboardStrips,
                  bestXI,
                  clubStandings,
                  homeClubsAggregate,
                  clubFantasyRanking,
                  locale,
                  mode,
                  removeWidget,
                })}
              </DashboardWidgetShell>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">
          {t("dashboardView.allWidgetsRemoved")}
        </p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {showAddPanel ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="pixel-corners border border-accent/30 bg-surface p-4"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("dashboardView.addWidgetTitle")}</p>

            {missingSingletons.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {missingSingletons.map((s) => (
                  <button
                    key={s.type}
                    onClick={() => addSingleton(s.type)}
                    className="pixel-corners-sm border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text"
                  >
                    {tLabels(`widgetType.${s.type}`)}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowStatPicker((v) => !v)}
              className="pixel-corners-sm border border-dashed border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              {showStatPicker ? t("dashboardView.hideStats") : t("dashboardView.addStat")}
            </button>

            <AnimatePresence>
              {showStatPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                    {STAT_LINES.map((line) => (
                      <button
                        key={line.key}
                        onClick={() => addStatWidget(line.key)}
                        className="pixel-corners-sm border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text"
                      >
                        {tLabels(`statLine.${line.key}`)}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {missingSingletons.length === 0 && !showStatPicker && (
              <p className="mt-2 text-xs text-text-muted">
                {t("dashboardView.allFixedWidgetsVisible")}
              </p>
            )}

            <button
              onClick={() => {
                setShowAddPanel(false);
                setShowStatPicker(false);
              }}
              className="mt-3 text-xs text-text-muted transition-colors hover:text-text"
            >
              {t("dashboardView.close")}
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShowAddPanel(true)}
            className="pixel-corners-sm border border-dashed border-border py-2.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:border-accent/50 hover:text-text"
          >
            {t("dashboardView.addWidgetCta")}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function renderWidget(
  widget: DashboardWidget,
  ctx: {
    seasonId: string;
    standings: GlobalStandingRow[];
    leagues: MyLeagueRow[];
    dashboardStrips: DashboardStrips;
    bestXI: BestXIEntry[];
    clubStandings: ClubStandingsResult;
    homeClubsAggregate: HomeClubsAggregate;
    clubFantasyRanking: ClubFantasyRankingRow[];
    locale: string;
    mode: SeasonMode;
    removeWidget: (id: string) => void;
  }
) {
  switch (widget.type) {
    case "best-xi":
      return <BestXIWidget entries={ctx.bestXI} />;
    case "leaderboard-global":
      return <LeaderboardGlobalWidget standings={ctx.standings} linkToTeam={ctx.mode === "live"} />;
    case "leaderboard-leagues":
      return <LeaderboardLeaguesWidget leagues={ctx.leagues} linkToTeam={ctx.mode === "live"} />;
    case "last-results":
      return (
        <MatchesStrip
          variant="results"
          size={widget.size}
          gameweekNumber={ctx.dashboardStrips.lastResults.gameweekNumber}
          matches={ctx.dashboardStrips.lastResults.matches}
        />
      );
    case "upcoming-matches":
      return (
        <MatchesStrip
          variant="upcoming"
          size={widget.size}
          gameweekNumber={ctx.dashboardStrips.upcoming.gameweekNumber}
          matches={ctx.dashboardStrips.upcoming.matches}
        />
      );
    case "club-standings":
      return (
        <ClubStandingsWidget
          standings={ctx.clubStandings.rows}
          gameweekNumber={ctx.clubStandings.gameweekNumber}
          size={widget.size}
        />
      );
    case "home-clubs-map":
      return <HomeClubsMapWidget aggregate={ctx.homeClubsAggregate} locale={ctx.locale} size={widget.size} />;
    case "club-fantasy-ranking":
      return <ClubFantasyRankingWidget ranking={ctx.clubFantasyRanking} size={widget.size} />;
    case "player-stats":
      return (
        <StatLeaderCard
          statKey={widget.statKey ?? ""}
          seasonId={ctx.seasonId}
          onRemove={() => ctx.removeWidget(widget.id)}
          size={widget.size}
        />
      );
    default:
      return null;
  }
}
