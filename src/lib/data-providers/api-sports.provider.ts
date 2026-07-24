// ARCHITECTURE.md §3.2 — ApiSportsProvider
// Source : v1.handball.api-sports.io — plan gratuit 100 req/jour
// Auth : header x-apisports-key (env API_SPORTS_KEY)

import { z } from "zod";
import type {
  StarligueDataProvider,
  ExternalTeam,
  ExternalFixture,
  ExternalPlayerStat,
  ExternalMatchStatus,
} from "./types";

const BASE_URL = "https://v1.handball.api-sports.io";

// ---- Zod schemas pour les réponses API-Sports ----

const ApiSportsResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    errors: z.union([z.array(z.unknown()), z.record(z.string())]),
    results: z.number(),
    response: z.array(itemSchema),
  });

const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
});

const GameStatusSchema = z.object({
  long: z.string(),
  short: z.string(),
  timer: z.number().nullable().optional(),
});

const GameSchema = z.object({
  id: z.number(),
  date: z.string(),
  time: z.string(),
  timestamp: z.number(),
  timezone: z.string(),
  week: z.string().nullable().optional(),
  status: GameStatusSchema,
  teams: z.object({
    home: TeamSchema,
    away: TeamSchema,
  }),
  scores: z.object({
    home: z.number().nullable(),
    away: z.number().nullable(),
  }),
  league: z.object({
    id: z.number(),
    name: z.string(),
    season: z.number(),
    round: z.string().nullable().optional(),
  }),
});

type ApiSportsGame = z.infer<typeof GameSchema>;

// ---- Helpers ----

function mapStatus(short: string): ExternalMatchStatus {
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(short)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P"].includes(short)) return "LIVE";
  if (["PST"].includes(short)) return "POSTPONED";
  if (["CANC", "ABD"].includes(short)) return "CANCELLED";
  return "SCHEDULED";
}

// "Regular Season - 1" → 1 ; "1" → 1 ; null → null
function parseGameweekNumber(round: string | null | undefined): number | null {
  if (!round) return null;
  const match = round.match(/(\d+)\s*$/);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}

function gameToFixture(game: ApiSportsGame): ExternalFixture | null {
  const gwNum = parseGameweekNumber(game.league.round ?? game.week);
  if (!gwNum) return null;

  const kickoffAt = new Date(
    game.timestamp ? game.timestamp * 1000 : `${game.date}T${game.time}:00Z`
  );

  return {
    externalId: String(game.id),
    gameweekNumber: gwNum,
    homeExternalId: String(game.teams.home.id),
    awayExternalId: String(game.teams.away.id),
    homeShortName: game.teams.home.code ?? game.teams.home.name.slice(0, 10),
    awayShortName: game.teams.away.code ?? game.teams.away.name.slice(0, 10),
    kickoffAt,
    status: mapStatus(game.status.short),
    homeScore: game.scores.home,
    awayScore: game.scores.away,
  };
}

// ---- Provider ----

export class ApiSportsProvider implements StarligueDataProvider {
  readonly name = "API_SPORTS";
  private readonly apiKey: string;
  private readonly leagueId: number;

  constructor(apiKey: string, leagueId: number) {
    this.apiKey = apiKey;
    this.leagueId = leagueId;
  }

  private async fetch<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await globalThis.fetch(url.toString(), {
      headers: {
        "x-apisports-key": this.apiKey,
        "Accept": "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`API-Sports ${path} → HTTP ${res.status}`);
    }

    const raw = await res.json();
    const parsed = ApiSportsResponseSchema(z.unknown()).safeParse(raw);
    if (!parsed.success) {
      throw new Error(`API-Sports réponse inattendue : ${parsed.error.message}`);
    }

    const errors = parsed.data.errors;
    const hasErrors =
      Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;
    if (hasErrors) {
      throw new Error(`API-Sports erreur API : ${JSON.stringify(errors)}`);
    }

    return parsed.data.response as T[];
  }

  async fetchTeams(season: string): Promise<ExternalTeam[]> {
    const raw = await this.fetch<unknown>("/teams", {
      league: String(this.leagueId),
      season,
    });

    return raw.flatMap((item) => {
      const parsed = z.object({ team: TeamSchema }).safeParse(item);
      if (!parsed.success) return [];
      const t = parsed.data.team;
      return [{
        externalId: String(t.id),
        name: t.name,
        shortName: t.code ?? t.name.slice(0, 10),
      }];
    });
  }

  async fetchFixtures(season: string): Promise<ExternalFixture[]> {
    const raw = await this.fetch<unknown>("/games", {
      league: String(this.leagueId),
      season,
    });

    const fixtures: ExternalFixture[] = [];
    for (const item of raw) {
      const parsed = GameSchema.safeParse(item);
      if (!parsed.success) continue;
      const fixture = gameToFixture(parsed.data);
      if (fixture) fixtures.push(fixture);
    }
    return fixtures;
  }

  // L'API-Sports handball ne fournit pas les notes LNH (propriété de la LNH).
  // Cette méthode retourne toujours [] — les notes viennent du LnhScraperProvider ou CSV.
  async fetchMatchPlayerStats(_externalMatchId: string): Promise<ExternalPlayerStat[]> {
    return [];
  }
}

export function createApiSportsProvider(): ApiSportsProvider | null {
  const key = process.env.API_SPORTS_KEY;
  const leagueIdEnv = process.env.API_SPORTS_LEAGUE_ID;
  if (!key) return null;
  const leagueId = leagueIdEnv ? parseInt(leagueIdEnv, 10) : 27; // 27 = StarLigue (à confirmer)
  return new ApiSportsProvider(key, leagueId);
}
