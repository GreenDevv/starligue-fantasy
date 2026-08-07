import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import { PositionBadge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { Position } from "@/lib/squad/validation";

interface SnapshotEntry {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
  isCaptain?: boolean; // snapshoté au verrouillage (team.captainId à cet instant, voir cron/snapshot-lineups) — reflète le capitaine DE CETTE JOURNÉE, pas le capitaine courant de l'équipe qui a pu changer depuis (§13.4)
}

export default async function LineupDetailPage({
  params,
  searchParams,
}: {
  params: { gameweekId: string; locale: string };
  searchParams: { league?: string };
}) {
  const tLabels = await getTranslations("labels");
  const t = await getTranslations("team");
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

  const lineup =
    mode === "simulation"
      ? await prisma.simulationLineup.findUnique({
          where: { simulationTeamId_gameweekId: { simulationTeamId: ctx.teamId, gameweekId: params.gameweekId } },
          include: { gameweek: { select: { number: true, isScored: true } } },
        })
      : await prisma.fantasyLineup.findUnique({
          where: { fantasyTeamId_gameweekId: { fantasyTeamId: ctx.teamId, gameweekId: params.gameweekId } },
          include: { gameweek: { select: { number: true, isScored: true } } },
        });

  if (!lineup) notFound();

  // En simulation "scored" = ce lineup a déjà des points (chaque équipe avance à
  // son rythme tant que l'avancée n'est pas globale, cf plan étape 6).
  const isScored = mode === "simulation" ? lineup.points !== null : lineup.gameweek.isScored;

  const entries = lineup.entries as unknown as SnapshotEntry[];
  const playerIds = entries.map((e) => e.playerId);

  const [players, rawStats, configs] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { club: { select: { shortName: true, logoUrl: true } } },
    }),
    isScored
      ? prisma.playerMatchStat.findMany({
          where: {
            playerId: { in: playerIds },
            match: { gameweekId: params.gameweekId },
          },
          include: {
            match: {
              select: {
                homeClubId: true,
                awayClubId: true,
                homeScore: true,
                awayScore: true,
              },
            },
            player: { select: { clubId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.gameConfig.findMany(),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const scoringConfig = parseScoringConfig(
    Object.fromEntries(configs.map((c) => [c.key, c.value]))
  );

  const statMap = new Map<
    string,
    { lnhRating: number | null; played: boolean; teamWon: boolean }
  >();
  for (const stat of rawStats) {
    const homeWon =
      stat.match.homeScore !== null &&
      stat.match.awayScore !== null &&
      stat.match.homeScore > stat.match.awayScore;
    const awayWon =
      stat.match.homeScore !== null &&
      stat.match.awayScore !== null &&
      stat.match.awayScore > stat.match.homeScore;
    const isHome = stat.player.clubId === stat.match.homeClubId;
    statMap.set(stat.playerId, {
      lnhRating: stat.lnhRating !== null ? Number(stat.lnhRating) : null,
      played: stat.played,
      teamWon: isHome ? homeWon : awayWon,
    });
  }

  const enriched = entries.map((e) => {
    const p = playerMap.get(e.playerId);
    const stat = statMap.get(e.playerId);
    const points =
      isScored && stat
        ? computePlayerPoints(
            {
              lnhRating: stat.lnhRating,
              played: stat.played,
              role: e.role,
              teamWon: stat.teamWon,
            },
            scoringConfig
          )
        : null;
    return { ...e, player: p, stat, points };
  });

  // Starters first, then bench
  const sorted = [
    ...enriched.filter((e) => e.role === "STARTER"),
    ...enriched.filter((e) => e.role === "BENCH"),
  ];

  const totalPoints = lineup.points !== null ? Number(lineup.points) : null;
  const bonusLabel = lineup.bonus ? tLabels(`bonus.${lineup.bonus}`) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/team/history?league=${ctx.leagueId}`}
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← {t("common.backToHistory")}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {mode === "simulation" && (
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-secondary">{t("common.simulationMode")}</p>
          )}
          <h1 className="text-2xl text-text">{t("common.matchday", { number: lineup.gameweek.number })}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {mode === "simulation"
              ? isScored ? t("gameweekDetail.statusSimScored") : t("gameweekDetail.statusSimPending")
              : isScored ? t("gameweekDetail.statusLiveScored") : t("gameweekDetail.statusLivePending")}
          </p>
          {bonusLabel && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-accent-secondary">
              {t("gameweekDetail.bonusActive", { bonus: bonusLabel })}
            </p>
          )}
        </div>
        {totalPoints !== null && (
          <div
            className={`font-arcade text-4xl leading-none drop-shadow-[0_0_8px_currentColor] ${
              totalPoints >= 0 ? "text-points-pos" : "text-points-neg"
            }`}
          >
            {totalPoints > 0 ? `+${totalPoints}` : totalPoints}
          </div>
        )}
      </div>

      {/* Starters section */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {t("common.starters")}
        </p>
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          <div className="divide-y divide-border">
            {sorted
              .filter((e) => e.role === "STARTER")
              .map((e) => (
                <PlayerRow key={e.playerId} entry={e} isScored={isScored} />
              ))}
          </div>
        </div>
      </div>

      {/* Bench section */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {t("common.bench")}
        </p>
        <div className="pixel-corners overflow-hidden border border-border bg-surface">
          <div className="divide-y divide-border">
            {sorted
              .filter((e) => e.role === "BENCH")
              .map((e) => (
                <PlayerRow key={e.playerId} entry={e} isScored={isScored} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  entry,
  isScored,
}: {
  entry: ReturnType<
    typeof Array.prototype.map<SnapshotEntry & {
      player: { firstName: string; lastName: string; photoUrl: string | null; club: { shortName: string; logoUrl: string | null } } | undefined;
      stat: { lnhRating: number | null; played: boolean } | undefined;
      points: number | null;
    }>
  >[number];
  isScored: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {entry.player && (
        <span className="relative">
          <PlayerAvatar
            player={{ ...entry.player, position: entry.position as Position }}
            size="sm"
          />
          {/* Brassard de capitaine — même pattern que HandballPitch.tsx (banc) */}
          {entry.isCaptain && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-bg bg-accent-secondary text-[8px] font-bold leading-none text-bg">
              C
            </span>
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">
          {entry.player?.firstName} {entry.player?.lastName}
        </p>
        <p className="flex items-center gap-1 text-xs text-text-muted">
          {entry.player?.club && <ClubLogo club={entry.player.club} size="xs" />}
          {entry.player?.club.shortName}
        </p>
      </div>
      <PositionBadge position={entry.position as Position} />
      {isScored ? (
        <div className="text-right">
          {entry.stat?.lnhRating !== null && entry.stat?.lnhRating !== undefined ? (
            <p className="text-xs text-text-muted tabular-nums">
              {entry.stat.lnhRating.toFixed(1)}
            </p>
          ) : (
            <p className="text-xs text-text-muted">—</p>
          )}
          <p
            className={`text-sm font-bold tabular-nums leading-none ${
              (entry.points ?? 0) >= 0 ? "text-points-pos" : "text-points-neg"
            }`}
          >
            {entry.points !== null
              ? entry.points > 0
                ? `+${entry.points}`
                : String(entry.points)
              : "0"}
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-muted">—</p>
      )}
    </div>
  );
}
