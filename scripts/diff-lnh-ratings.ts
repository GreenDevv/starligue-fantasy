// Script ponctuel (LECTURE SEULE) : re-scrape les boxscores lnh.fr d'une journée
// déjà synchronisée et compare, ligne par ligne, avec ce qui est enregistré en base
// (PlayerMatchStat). Sert à repérer les corrections que la LNH publie 2-3 jours
// après les matchs (notes de performance surtout, mais aussi les 13 stats détaillées).
//
// N'ÉCRIT RIEN. Pour appliquer les corrections détectées, relancer ensuite
// /api/cron/sync-ratings?gameweek=N (ou scripts/backfill-boxscore-stats.ts pour la
// simulation) — même pipeline d'upsert.
//
// Usage :
//   pnpm tsx scripts/diff-lnh-ratings.ts [gameweekNumber=1] [lnhSeasonsId=40]
// Contre la prod Railway :
//   DATABASE_URL="postgresql://...sakura.proxy.rlwy.net:PORT/railway?sslmode=require" \
//     pnpm tsx scripts/diff-lnh-ratings.ts 1
import { PrismaClient } from "@prisma/client";
import {
  createLnhScraperProvider,
  boxscoreRowToStatFields,
} from "../src/lib/data-providers/lnh-scraper.provider";

const prisma = new PrismaClient();

// Champs de PlayerMatchStat issus du scraping qu'on compare (cf. boxscoreRowToStatFields).
const COMPARED_FIELDS = [
  "lnhRating",
  "played",
  "saves",
  "shotsFaced",
  "savePercentage",
  "goalsPlay",
  "shotsPlay",
  "goalsPenalty",
  "shotsPenalty",
  "goalsTotal",
  "shotsTotal",
  "shotPercentage",
  "assists",
  "ballsRecovered",
  "opponentShotsBlocked",
  "penaltiesDrawn",
  "twoMinDrawn",
  "neutralizations",
  "turnovers",
  "twoMinTaken",
  "disqualified",
] as const;

// Normalise pour comparer : lnhRating/shotPercentage/savePercentage sont des
// Prisma.Decimal en base (objet) mais des number après scraping → on ramène tout
// nombre (ou chaîne numérique, ou Decimal) à un number.
function norm(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return v.trim() !== "" && !Number.isNaN(n) ? n : v;
  }
  if (typeof v === "object") {
    const s = String(v);
    const n = Number(s);
    return Number.isNaN(n) ? s : n;
  }
  return v;
}

function eq(a: unknown, b: unknown): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (typeof na === "number" && typeof nb === "number") return Math.abs(na - nb) < 1e-6;
  return na === nb;
}

async function main() {
  const gameweekNumber = parseInt(process.argv[2] ?? "1", 10);
  const lnhSeasonsId = process.argv[3] ?? "40"; // 2026/2027

  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbHost = dbUrl.replace(/^.*@/, "").replace(/\/.*$/, "") || "(inconnu)";
  console.log(`Base : ${dbHost}`);
  console.log(`Journée J${gameweekNumber}, lnhSeasonsId=${lnhSeasonsId}\n`);

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");

  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: gameweekNumber } },
    include: {
      matches: {
        include: {
          homeClub: { select: { shortName: true } },
          awayClub: { select: { shortName: true } },
          playerStats: {
            include: { player: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });
  if (!gameweek) throw new Error(`Journée J${gameweekNumber} introuvable`);

  const matchesWithCalendarsId = gameweek.matches
    .map((m) => ({ match: m, calendarsId: (m.externalIds as Record<string, string>)?.lnh_calendars_id }))
    .filter((x): x is { match: (typeof gameweek.matches)[number]; calendarsId: string } => Boolean(x.calendarsId));

  console.log(
    `${gameweek.matches.length} match(s) en base, ${matchesWithCalendarsId.length} avec lnh_calendars_id\n`
  );
  if (matchesWithCalendarsId.length === 0) return;

  const provider = createLnhScraperProvider();
  const boxscoresByCalendarsId = await provider.fetchGameweekMatchStats(
    matchesWithCalendarsId.map((x) => x.calendarsId),
    lnhSeasonsId
  );

  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }

  const seasonPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });
  const playerByKey = new Map<string, (typeof seasonPlayers)[number]>();
  for (const p of seasonPlayers) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}|${p.club.shortName.toLowerCase()}`;
    playerByKey.set(key, p);
  }

  let totalRows = 0;
  let unchanged = 0;
  const ratingChanges: string[] = [];
  const otherChanges: string[] = [];
  const newRows: string[] = [];
  const missingFresh: string[] = [];

  for (const { match, calendarsId } of matchesWithCalendarsId) {
    const label = `${match.homeClub.shortName}–${match.awayClub.shortName}`;
    const rows = boxscoresByCalendarsId.get(calendarsId) ?? [];
    const storedByPlayerId = new Map(match.playerStats.map((s) => [s.playerId, s]));
    const seenPlayerIds = new Set<string>();

    for (const row of rows) {
      const clubShortName = clubShortNameBySlug.get(row.lnhClubSlug.toLowerCase());
      if (!clubShortName) continue;
      const key = `${row.lastName.toLowerCase()}|${row.firstName.toLowerCase()}|${clubShortName.toLowerCase()}`;
      const player = playerByKey.get(key);
      if (!player) continue;

      totalRows++;
      seenPlayerIds.add(player.id);
      const fresh = boxscoreRowToStatFields(row) as Record<string, unknown>;
      const stored = storedByPlayerId.get(player.id) as Record<string, unknown> | undefined;
      const who = `${label}  ${row.lastName} ${row.firstName} (${clubShortName})`;

      if (!stored) {
        newRows.push(`${who} — pas de PlayerMatchStat en base | note LNH scrapée=${fresh.lnhRating}`);
        continue;
      }

      const diffs: string[] = [];
      for (const f of COMPARED_FIELDS) {
        if (!eq(fresh[f], stored[f])) {
          diffs.push(`${f}: ${JSON.stringify(norm(stored[f]))} → ${JSON.stringify(norm(fresh[f]))}`);
        }
      }
      if (diffs.length === 0) {
        unchanged++;
        continue;
      }
      const ratingDiff = diffs.find((d) => d.startsWith("lnhRating:"));
      const line = `${who}\n    ${diffs.join("\n    ")}`;
      if (ratingDiff) ratingChanges.push(line);
      else otherChanges.push(line);
    }

    for (const s of match.playerStats) {
      if (!seenPlayerIds.has(s.playerId)) {
        const p = (s as { player: { firstName: string; lastName: string } }).player;
        missingFresh.push(
          `${label}  ${p.lastName} ${p.firstName} — en base (note=${(s as Record<string, unknown>).lnhRating}) mais absent du scrape actuel`
        );
      }
    }
  }

  const section = (title: string, lines: string[]) => {
    console.log(`\n=== ${title} (${lines.length}) ===`);
    for (const l of lines) console.log(`  ${l}`);
  };

  console.log(`Lignes joueurs comparées : ${totalRows} — inchangées : ${unchanged}`);
  section("CHANGEMENTS DE NOTE LNH", ratingChanges);
  section("AUTRES CHANGEMENTS DE STATS", otherChanges);
  section("Lignes scrapées sans stat en base", newRows);
  section("Stats en base absentes du scrape actuel", missingFresh);

  const impacted = ratingChanges.length + otherChanges.length;
  console.log(
    `\n${impacted === 0 ? "✅ Aucune correction détectée." : `⚠️  ${impacted} ligne(s) modifiée(s) par la LNH depuis notre dernière synchro.`}`
  );
  if (impacted > 0) {
    console.log(`Pour appliquer : POST /api/cron/sync-ratings?gameweek=${gameweekNumber} (upsert idempotent, puis recalcul des points de la journée).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
