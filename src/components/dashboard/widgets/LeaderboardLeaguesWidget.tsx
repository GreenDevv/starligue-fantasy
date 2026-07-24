import Link from "next/link";

export interface MyLeagueRow {
  id: string;
  name: string;
  myRank: number;
  myPoints: number;
  memberCount: number;
}

export function LeaderboardLeaguesWidget({ leagues }: { leagues: MyLeagueRow[] }) {
  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">Mes ligues</p>
        {leagues.length > 0 && (
          <Link href="/leagues" className="text-[10px] text-text-muted transition-colors hover:text-text">
            Voir tout →
          </Link>
        )}
      </div>
      {leagues.length === 0 ? (
        // CTA volontairement discret ici (lien, pas de bouton plein) — celui du
        // bandeau de statut en haut de page porte déjà cette action en avant.
        <p className="py-4 text-center text-xs text-text-muted">
          Tu n'as pas encore rejoint de ligue.{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            Rejoindre une ligue →
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
                <p className="truncate text-[10px] text-text-muted">{l.memberCount} membre{l.memberCount > 1 ? "s" : ""}</p>
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
