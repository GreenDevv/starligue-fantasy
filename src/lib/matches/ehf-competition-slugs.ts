// Slugs d'URL pour la page groupe EHF (/matches/ehf/[competition]/[group],
// ARCHITECTURE.md §19) — petit module partagé entre ClubMatchesPanel (construit le
// lien vers cette page depuis un match Champions League/European League) et la
// page elle-même (résout le competitionLabel FriendlyMatch à partir du slug d'URL),
// pour ne jamais dupliquer les deux chaînes en clair à deux endroits.
import { EHF_CHAMPIONS_LEAGUE_LABEL, EHF_EUROPEAN_LEAGUE_LABEL } from "@/lib/data-providers/ehf-scraper.provider";

export type EhfCompetitionKind = "championsLeague" | "europeanLeague";

const SLUG_BY_KIND: Record<EhfCompetitionKind, string> = {
  championsLeague: "champions-league",
  europeanLeague: "european-league",
};

const KIND_BY_SLUG: Record<string, EhfCompetitionKind> = {
  "champions-league": "championsLeague",
  "european-league": "europeanLeague",
};

const LABEL_BY_KIND: Record<EhfCompetitionKind, string> = {
  championsLeague: EHF_CHAMPIONS_LEAGUE_LABEL,
  europeanLeague: EHF_EUROPEAN_LEAGUE_LABEL,
};

export function ehfCompetitionSlug(kind: EhfCompetitionKind): string {
  return SLUG_BY_KIND[kind];
}

export function ehfCompetitionLabelFromSlug(slug: string): string | null {
  const kind = KIND_BY_SLUG[slug];
  return kind ? LABEL_BY_KIND[kind] : null;
}

export function ehfCompetitionKindFromSlug(slug: string): EhfCompetitionKind | null {
  return KIND_BY_SLUG[slug] ?? null;
}
