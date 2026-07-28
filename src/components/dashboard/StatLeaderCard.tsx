"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Position } from "@/lib/squad/validation";
import { getStatLine } from "@/lib/stats/stat-lines";
import { getComputedStatLine } from "@/lib/stats/computed-stat-lines";
import type { WidgetSize } from "@/lib/dashboard/layout";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { teamColor } from "@/lib/team/team-colors";

// Extrait de src/components/dashboard/StatLeadersPanel.tsx — réutilisé tel quel par
// le dashboard personnalisable (widget "stat joueur", src/components/DashboardView.tsx).
// showRemove=false quand le retrait du widget est géré par le chrome générique du
// dashboard (DashboardWidgetShell) plutôt que par le "×" interne.

interface LeaderApiRow {
  playerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  position: Position;
  club: { shortName: string; logoUrl: string | null };
  value: number;
}

type StatScope = "gameweek" | "season" | "average";

interface MyTeam {
  teamId: string;
  teamName: string;
  playerIds: string[];
}

// Petit(s) point(s) coloré(s) — une couleur par équipe de l'utilisateur (ordre de
// jointe de ligue) — pour repérer d'un coup d'œil "je possède déjà ce joueur",
// sans se confondre avec l'anneau de poste de PlayerAvatar (axe différent).
function OwnershipDots({ playerId, myTeams }: { playerId: string; myTeams: MyTeam[] }) {
  const t = useTranslations("dashboard");
  const owningTeams = myTeams
    .map((team, i) => ({ ...team, color: teamColor(i) }))
    .filter((team) => team.playerIds.includes(playerId));
  if (owningTeams.length === 0) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      title={t("statLeaderCard.ownedByTeams", { teams: owningTeams.map((team) => team.teamName).join(", ") })}
    >
      {owningTeams.map((team) => (
        <span
          key={team.teamId}
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: team.color, boxShadow: `0 0 4px ${team.color}` }}
        />
      ))}
    </span>
  );
}

export function StatLeaderCard({
  statKey,
  seasonId,
  onRemove,
  showRemove = true,
  size = "square",
}: {
  statKey: string;
  seasonId: string;
  onRemove: () => void;
  showRemove?: boolean;
  size?: WidgetSize;
}) {
  const t = useTranslations("dashboard");
  const tLabels = useTranslations("labels");
  const tCommon = useTranslations("common");
  const line = getStatLine(statKey) ?? getComputedStatLine(statKey);
  const compact = size === "mini";
  const showPhotos = !compact;
  const [scope, setScope] = useState<StatScope>("gameweek");
  const [leaders, setLeaders] = useState<LeaderApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/stats/leaders?statKey=${statKey}&scope=${scope}&seasonId=${seasonId}`)
      .then((r) => r.json())
      .then((json: { data?: { leaders: LeaderApiRow[] } }) => {
        if (cancelled) return;
        setLeaders(json.data?.leaders ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statKey, scope, seasonId]);

  // Une seule fois (indépendant de statKey/scope) : mes équipes + leurs effectifs,
  // pour surligner "je le possède déjà" sur chaque ligne. Non bloquant pour
  // l'affichage des leaders — silencieux si non connecté/pas d'équipe.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/my-team/ownership")
      .then((r) => r.json())
      .then((json: { data?: { teams: MyTeam[] } }) => {
        if (!cancelled) setMyTeams(json.data?.teams ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!line) return null;
  const [top, ...rest] = leaders;

  function displayName(p: { firstName: string; lastName: string }): string {
    return compact ? `${p.firstName.charAt(0)}. ${p.lastName}` : `${p.firstName} ${p.lastName}`;
  }

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-text">{tLabels(`statLine.${line.key}`)}</p>
          {showRemove && (
            <button
              onClick={onRemove}
              aria-label={t("statLeaderCard.removeAriaLabel", { label: tLabels(`statLine.${line.key}`) })}
              className="shrink-0 px-1 text-text-muted transition-colors hover:text-points-neg"
            >
              ×
            </button>
          )}
        </div>
        <div
          className={`flex self-start overflow-hidden rounded-md border border-border uppercase ${
            compact ? "text-[8px] tracking-normal" : "text-[10px] tracking-wide"
          }`}
        >
          {(["gameweek", "season", "average"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`whitespace-nowrap transition-colors ${compact ? "px-1 py-0.5" : "px-1.5 py-1"} ${
                scope === s ? "bg-accent text-bg" : "text-text-muted hover:text-text"
              }`}
            >
              {tLabels(`statScope.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-4 text-center text-xs text-text-muted">{tCommon("loading")}</p>
      ) : leaders.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-muted">{t("statLeaderCard.noData")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {top && (
            <Link
              href={`/players/${top.playerId}`}
              className="flex items-center gap-3 rounded-md transition-colors hover:bg-border/20"
            >
              {showPhotos && <PlayerAvatar player={top} size="lg" />}
              <div className="min-w-0 flex-1">
                <p
                  className={`flex items-center gap-1.5 truncate font-medium text-text ${compact ? "text-xs" : "text-sm"}`}
                >
                  {displayName(top)}
                  <OwnershipDots playerId={top.playerId} myTeams={myTeams} />
                </p>
                {showPhotos && (
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <ClubLogo club={top.club} size="xs" />
                    <span>{top.club.shortName}</span>
                  </div>
                )}
              </div>
              <span
                className={`font-arcade leading-none tracking-wide text-accent-secondary drop-shadow-[0_0_6px_rgba(245,158,11,0.6)] ${
                  compact ? "text-lg" : "text-2xl"
                }`}
              >
                {top.value}
              </span>
            </Link>
          )}

          {rest.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              {rest.map((p, i) => (
                <Link
                  key={p.playerId}
                  href={`/players/${p.playerId}`}
                  className="flex items-center gap-2 rounded-md transition-colors hover:bg-border/20"
                >
                  <span className="w-4 shrink-0 text-center text-[10px] text-text-muted">{i + 2}</span>
                  {showPhotos && <PlayerAvatar player={p} size="xs" />}
                  {showPhotos && <ClubLogo club={p.club} size="xs" className="h-3.5 w-3.5" />}
                  <span className={`min-w-0 flex-1 truncate text-text ${compact ? "text-[11px]" : "text-xs"}`}>
                    {displayName(p)}
                  </span>
                  <OwnershipDots playerId={p.playerId} myTeams={myTeams} />
                  <span className={`shrink-0 font-medium text-text-muted ${compact ? "text-[11px]" : "text-xs"}`}>
                    {p.value}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
