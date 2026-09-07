// Rend le visuel /api/og/gameweek-recap avec des données FICTIVES et l'écrit dans
// scratch/gameweek-recap-preview.png — pour vérifier le rendu sans monter un
// scénario complet (équipe validée + journée notée + session).
//   npx tsx scripts/preview-gameweek-recap-image.tsx
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderGameweekRecapImage, type GameweekRecapImageData } from "../src/lib/social/gameweek-recap-image";

async function main() {
  const FONTS_DIR = path.join(process.cwd(), "src/lib/social/fonts");
  const [display, sans] = await Promise.all([
    readFile(path.join(FONTS_DIR, "BarlowCondensed-Bold.ttf")),
    readFile(path.join(FONTS_DIR, "Inter-Regular.ttf")),
  ]);

  const psgLogo = await readFile(path.join(process.cwd(), "public/clubs/psg.png")).catch(() => null);

  const data: GameweekRecapImageData = {
    gameweekNumber: 6,
    teamName: "Les Costauds de Cresseron",
    leagueName: "Gainneville League",
    totalPoints: 68,
    rank: { globalRank: 14, leagueRank: 2, globalDelta: 8, leagueDelta: -1, totalTeams: 312 },
    topPerformer: {
      firstName: "Mathieu",
      lastName: "Grebille",
      position: "RW",
      clubShortName: "PSG",
      clubLogoDataUri: psgLogo ? `data:image/png;base64,${psgLogo.toString("base64")}` : null,
      photoUrl: null,
      points: 21,
    },
    starters: [
      { playerId: "1", firstName: "Rémi", lastName: "Desbonnet", position: "GK", isCaptain: false, points: 6 },
      { playerId: "2", firstName: "Baptiste", lastName: "Afgour", position: "LW", isCaptain: false, points: 3 },
      { playerId: "3", firstName: "Elohim", lastName: "Prandi", position: "LB", isCaptain: true, points: 16 },
      { playerId: "4", firstName: "Dika", lastName: "Mem", position: "CB", isCaptain: false, points: 9 },
      { playerId: "5", firstName: "Benoît", lastName: "Nyateu", position: "RB", isCaptain: false, points: 7 },
      { playerId: "6", firstName: "Mathieu", lastName: "Grebille", position: "RW", isCaptain: false, points: 21 },
      { playerId: "7", firstName: "Julien", lastName: "Cavelier", position: "PV", isCaptain: false, points: 4 },
    ],
    bench: [
      { playerId: "8", firstName: "Adrien", lastName: "Gérard", position: "GK", isCaptain: false, points: 2 },
      { playerId: "9", firstName: "Yanis", lastName: "Tché", position: "LW", isCaptain: false, points: 1 },
      { playerId: "10", firstName: "Tom", lastName: "Rivera", position: "LB", isCaptain: false, points: -2 },
      { playerId: "11", firstName: "Jean", lastName: "Collet", position: "CB", isCaptain: false, points: 1 },
      { playerId: "12", firstName: "Nicolas", lastName: "Tournat", position: "RB", isCaptain: false, points: 0 },
      { playerId: "13", firstName: "Charles", lastName: "Richardson", position: "RW", isCaptain: false, points: 0 },
      { playerId: "14", firstName: "Olivier", lastName: "Nyokas", position: "PV", isCaptain: false, points: 0 },
    ],
  };

  const res = renderGameweekRecapImage(data, { display, sans });
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join(process.cwd(), "scratch/gameweek-recap-preview.png");
  await writeFile(out, buf);
  console.log(`écrit : ${out} (${buf.length} octets)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
