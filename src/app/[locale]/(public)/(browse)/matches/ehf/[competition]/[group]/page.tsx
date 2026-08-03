// Page "groupe" EHF Champions League/European League (ARCHITECTURE.md §19) —
// demande explicite de l'utilisateur : cliquer sur un match CL/EL (ClubMatchesPanel)
// doit amener sur une page listant TOUS les matchs du groupe (les 4 équipes,
// y compris les confrontations n'impliquant aucun club Starligue) et le classement
// calculé du groupe. Pas d'API de classement dédiée côté EHF (reconnaissance
// effectuée sur https://ehfcl.eurohandball.com/men/2026-27/standings/ : seule une
// liste de matchs brute est exposée) — le classement est donc calculé ici à partir
// des résultats déjà stockés (computeGroupStandings, même règles que
// computeClubStandings mais keyed par nom d'équipe).
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { getGroupMatches, type GroupTeam } from "@/lib/matches/get-group-matches";
import { computeGroupStandings } from "@/lib/matches/group-standings";
import { ehfCompetitionLabelFromSlug } from "@/lib/matches/ehf-competition-slugs";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { MatchesStrip } from "@/components/dashboard/MatchesStrip";

function teamHref(team: GroupTeam): string | null {
  return team.clubId ? `/clubs/${team.clubId}` : null;
}

export default async function EhfGroupPage({ params }: { params: { competition: string; group: string } }) {
  const t = await getTranslations("matches");
  const tClubs = await getTranslations("clubs");
  const tDashboard = await getTranslations("dashboard");

  const competitionLabel = ehfCompetitionLabelFromSlug(params.competition);
  if (!competitionLabel) notFound();

  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);
  if (!season) notFound();

  const matches = await getGroupMatches(season.id, competitionLabel, params.group);
  if (matches.length === 0) notFound();

  // Une équipe hors DB peut apparaître à domicile sur un match et à l'extérieur sur
  // un autre — une seule Map par nom pour dédupliquer, peu importe le côté.
  const teamByName = new Map<string, GroupTeam>();
  for (const m of matches) {
    teamByName.set(m.home.name, m.home);
    teamByName.set(m.away.name, m.away);
  }

  const standings = computeGroupStandings(
    [...teamByName.keys()],
    matches.map((m) => ({
      homeTeamName: m.home.name,
      awayTeamName: m.away.name,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }))
  );

  const col = (key: string) => tDashboard(`clubStandingsWidget.col.${key}`);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {tClubs("detail.backToDashboard")}
      </Link>

      <div>
        <h1 className="text-xl text-text">{competitionLabel}</h1>
        <p className="text-sm text-text-muted">{t("group.title", { group: params.group })}</p>
      </div>

      {/* Classement */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">{t("group.standingsTitle")}</p>
        <div className="pixel-corners border border-border bg-surface p-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="w-6 py-1 text-left font-normal">#</th>
                  <th className="py-1 text-left font-normal">{col("club")}</th>
                  <th className="w-8 py-1 text-right font-normal">{col("played")}</th>
                  <th className="w-8 py-1 text-right font-normal">{col("wins")}</th>
                  <th className="w-8 py-1 text-right font-normal">{col("draws")}</th>
                  <th className="w-8 py-1 text-right font-normal">{col("losses")}</th>
                  <th className="w-10 py-1 text-right font-normal">{col("goalsFor")}</th>
                  <th className="w-10 py-1 text-right font-normal">{col("goalsAgainst")}</th>
                  <th className="w-10 py-1 text-right font-normal">{col("diff")}</th>
                  <th className="w-10 py-1 text-right font-semibold text-text">{col("points")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const team = teamByName.get(s.teamName)!;
                  const href = teamHref(team);
                  const nameContent = (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ClubLogo club={team} size="xs" />
                      <span className="truncate text-text">{team.shortName}</span>
                    </span>
                  );
                  return (
                    <tr key={s.teamName} className="border-t border-border/60">
                      <td className="py-1.5 tabular-nums text-text-muted">{s.rank}</td>
                      <td className="max-w-[160px] py-1.5">
                        {href ? (
                          <Link href={href} className="hover:text-accent">
                            {nameContent}
                          </Link>
                        ) : (
                          nameContent
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.played}</td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.wins}</td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.draws}</td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.losses}</td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.goalsFor}</td>
                      <td className="py-1.5 text-right tabular-nums text-text-muted">{s.goalsAgainst}</td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${
                          s.goalDiff > 0 ? "text-points-pos" : s.goalDiff < 0 ? "text-points-neg" : "text-text-muted"
                        }`}
                      >
                        {s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-accent">{s.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Matchs du groupe — même composant (MatchesStrip) que partout ailleurs dans
          l'app (home, TeamView/SimulationView) pour un rendu cohérent, demande
          explicite de l'utilisateur ("comme on affiche tous les matchs depuis le
          début") plutôt qu'un gabarit dédié à cette page. disableLink : pas de page
          de destination naturelle pour un match entre deux équipes EHF (contrairement
          au championnat), même traitement que Warm Up/Coupe de France ailleurs. */}
      <MatchesStrip
        variant="results"
        title={t("group.matchesTitle")}
        gameweekNumber={null}
        disableLink
        showDate
        matches={matches.map((m) => ({
          id: m.id,
          homeClub: { id: m.home.clubId ?? undefined, shortName: m.home.shortName, name: m.home.name, logoUrl: m.home.logoUrl },
          awayClub: { id: m.away.clubId ?? undefined, shortName: m.away.shortName, name: m.away.name, logoUrl: m.away.logoUrl },
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          kickoffAt: m.kickoffAt,
        }))}
      />
    </div>
  );
}
