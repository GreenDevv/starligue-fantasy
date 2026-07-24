// ARCHITECTURE.md §3.2 — interface provider unique
export interface ExternalTeam {
  externalId: string;
  name: string;
  shortName: string;
}

export type ExternalMatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

export interface ExternalFixture {
  externalId: string;                   // ID dans la source externe (upsert key)
  gameweekNumber: number;
  homeExternalId: string;               // club external ID
  awayExternalId: string;
  homeShortName: string;                // fallback matching
  awayShortName: string;
  kickoffAt: Date;
  status: ExternalMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ExternalPlayerStat {
  clubShortName: string;
  firstName: string;
  lastName: string;
  lnhRating: number | null;
  played: boolean;
}

export interface StarligueDataProvider {
  name: string;
  fetchTeams(season: string): Promise<ExternalTeam[]>;
  fetchFixtures(season: string): Promise<ExternalFixture[]>;
  fetchMatchPlayerStats(externalMatchId: string): Promise<ExternalPlayerStat[]>;
}
