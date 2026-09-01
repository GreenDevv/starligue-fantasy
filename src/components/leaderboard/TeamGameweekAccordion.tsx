"use client";

// Détail par journée d'une équipe (classement général/de ligue "hyper détaillé") —
// chaque ligne se déplie pour descendre au niveau joueur : quel joueur a rapporté
// combien de points cette journée-là, pas seulement l'agrégat effectif vs
// pronostics. Chargé à la demande (une équipe peut avoir 30+ journées, jamais
// tout préchargé) via /api/leaderboard/team/[teamId]/gameweek/[gameweekId].
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PositionBadge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { Position } from "@/lib/squad/validation";

export interface TeamGameweekRow {
  gameweekId: string;
  gameweekNumber: number;
  points: number;
  rawPoints: number | null;
  predictionDelta: number | null;
  bonus: string | null;
}

interface PlayerBreakdownRow {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  clubShortName: string;
  clubLogoUrl: string | null;
  role: "STARTER" | "BENCH";
  isCaptain: boolean;
  lnhRating: number | null;
  played: boolean;
  points: number;
}

export function TeamGameweekAccordion({ teamId, gameweeks }: { teamId: string; gameweeks: TeamGameweekRow[] }) {
  const t = useTranslations("leaderboard");
  const tLabels = useTranslations("labels");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playersByGameweek, setPlayersByGameweek] = useState<Record<string, PlayerBreakdownRow[] | "loading" | "error">>({});

  async function toggle(gw: TeamGameweekRow) {
    if (expandedId === gw.gameweekId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(gw.gameweekId);
    if (playersByGameweek[gw.gameweekId]) return;
    setPlayersByGameweek((prev) => ({ ...prev, [gw.gameweekId]: "loading" }));
    try {
      const res = await fetch(`/api/leaderboard/team/${teamId}/gameweek/${gw.gameweekId}`);
      const json = (await res.json()) as { data?: { players: PlayerBreakdownRow[] } };
      setPlayersByGameweek((prev) => ({ ...prev, [gw.gameweekId]: json.data?.players ?? "error" }));
    } catch {
      setPlayersByGameweek((prev) => ({ ...prev, [gw.gameweekId]: "error" }));
    }
  }

  return (
    <div className="pixel-corners overflow-hidden border border-border bg-surface">
      {/* En-têtes — masqués sur mobile, chaque ligne reste lisible seule */}
      <div className="hidden grid-cols-[3.5rem_1fr_1fr_1fr] gap-2 border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest text-text-muted sm:grid">
        <span>{t("team.col.gameweek")}</span>
        <span className="text-right">{t("team.col.squad")}</span>
        <span className="text-right">{t("team.col.predictions")}</span>
        <span className="text-right">{t("team.col.total")}</span>
      </div>
      <div className="divide-y divide-border">
        {[...gameweeks].reverse().map((gw) => {
          const expanded = expandedId === gw.gameweekId;
          const players = playersByGameweek[gw.gameweekId];
          return (
            <div key={gw.gameweekId}>
              <button
                type="button"
                onClick={() => toggle(gw)}
                className="grid w-full grid-cols-2 gap-x-2 gap-y-1 px-4 py-2.5 text-left text-sm transition-colors hover:bg-border/20 sm:grid-cols-[3.5rem_1fr_1fr_1fr] sm:items-center"
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
                  {gw.predictionDelta !== null ? (gw.predictionDelta > 0 ? `+${gw.predictionDelta}` : gw.predictionDelta) : "—"}
                </span>

                <span
                  className={`text-right font-semibold tabular-nums sm:text-right ${
                    gw.points > 0 ? "text-points-pos" : gw.points < 0 ? "text-points-neg" : "text-text-muted"
                  }`}
                >
                  {gw.points > 0 ? `+${gw.points}` : gw.points}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-border bg-bg/40 px-2 py-2">
                  {players === undefined || players === "loading" ? (
                    <p className="py-3 text-center text-xs text-text-muted">{t("loading")}</p>
                  ) : players === "error" ? (
                    <p className="py-3 text-center text-xs text-text-muted">{t("team.playersError")}</p>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {(["STARTER", "BENCH"] as const).map((role) =>
                        players
                          .filter((p) => p.role === role)
                          .map((p) => (
                            <div key={p.playerId} className="flex items-center gap-2.5 px-2 py-1.5">
                              <span className="relative">
                                <PlayerAvatar player={{ ...p, position: p.position }} size="xs" />
                                {p.isCaptain && (
                                  <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full border border-bg bg-accent-secondary text-[7px] font-bold leading-none text-bg">
                                    C
                                  </span>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-text">
                                  {p.firstName} {p.lastName}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] text-text-muted">
                                  <ClubLogo club={{ shortName: p.clubShortName, logoUrl: p.clubLogoUrl }} size="xs" />
                                  {p.clubShortName}
                                </p>
                              </div>
                              <PositionBadge position={p.position} />
                              <div className="w-10 shrink-0 text-right">
                                {p.lnhRating !== null ? (
                                  <p className="text-[10px] text-text-muted tabular-nums">{p.lnhRating.toFixed(1)}</p>
                                ) : (
                                  <p className="text-[10px] text-text-muted">—</p>
                                )}
                                <p
                                  className={`text-xs font-bold tabular-nums leading-none ${
                                    p.points >= 0 ? "text-points-pos" : "text-points-neg"
                                  }`}
                                >
                                  {p.points > 0 ? `+${p.points}` : p.points}
                                </p>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
