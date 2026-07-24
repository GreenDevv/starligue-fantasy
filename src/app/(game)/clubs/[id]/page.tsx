import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import { getClubPageData } from "@/lib/clubs/club-page-data";
import { POSITIONS } from "@/lib/squad/validation";
import { POSITION_LABELS } from "@/components/ui/positionTheme";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { ClubGoalsChart } from "@/components/charts/ClubGoalsChart";
import { ClubMatchesPanel } from "@/components/clubs/ClubMatchesPanel";

export default async function ClubPage({ params }: { params: { id: string } }) {
  const mode = resolveSeasonMode();
  const season = await resolveModeSeason(mode);
  if (!season) notFound();

  const club = await prisma.club.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  if (!club) notFound();

  const [roster, { results, upcoming, goalsChartEntries }] = await Promise.all([
    prisma.player.findMany({
      where: { clubId: club.id, seasonId: season.id },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, position: true, photoUrl: true, marketValue: true },
    }),
    getClubPageData(club.id, season.id, mode),
  ]);

  const rosterByPosition = POSITIONS.map((pos) => ({
    position: pos,
    players: roster.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  const isSimulation = season.label === SIMULATION_SEASON_LABEL;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard" className="text-sm text-text-muted hover:text-text transition-colors">
        ← Dashboard
      </Link>

      {/* Club header */}
      <div className="flex items-center gap-4 pixel-corners border border-border bg-surface p-4">
        <ClubLogo club={club} size="lg" />
        <div>
          <h1 className="text-2xl text-text">{club.name}</h1>
          <p className="text-sm text-text-muted">
            {isSimulation ? "Simulation" : "Saison"} {season.label}
          </p>
        </div>
      </div>

      {/* Buts marqués/encaissés par journée */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Buts par journée</p>
        <div className="pixel-corners border border-border bg-surface p-4">
          <ClubGoalsChart entries={goalsChartEntries} />
        </div>
      </div>

      {/* Résultats / prochains matchs, filtrables domicile-extérieur */}
      <ClubMatchesPanel clubId={club.id} results={results} upcoming={upcoming} />

      {/* Effectif */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Effectif — {roster.length} joueur{roster.length > 1 ? "s" : ""}
        </p>
        {rosterByPosition.length === 0 ? (
          <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm text-text-muted">Aucun joueur enregistré pour l'instant.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rosterByPosition.map((g) => (
              <div key={g.position}>
                <p className="mb-1.5 text-[10px] uppercase tracking-widest text-text-muted">
                  {POSITION_LABELS[g.position]}
                </p>
                <div className="overflow-hidden pixel-corners border border-border bg-surface">
                  <div className="divide-y divide-border">
                    {g.players.map((p) => (
                      <Link
                        key={p.id}
                        href={`/players/${p.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-border/20"
                      >
                        <PlayerAvatar player={p} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="w-16 shrink-0 text-right font-arcade text-lg tracking-wide text-accent-secondary">
                          {Number(p.marketValue).toFixed(1)}M
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
