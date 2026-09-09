// Assemble les données du reel « programme J2 » → <REEL_DIR>/data.json
// - fixtures : J02 Daikin StarLigue 2026/27, scrapées de lnh.fr (calendrier +
//   pages "Infos" pour les salles), figées ici comme pour la J1.
// - club meta : couleur (reprise du reel 16-maillots), salle + ville (table CLUB,
//   validées à la J1 + recoupées lnh.fr pour les 8 clubs à domicile de la J2).
// - joueur mis en avant : LE MEILLEUR joueur de chaque club sur la J1, au sens
//   POINTS FANTASY (computeGameweekPlayerPoints : note LNH + bonus victoire +
//   bonus/malus leader de journée). Repli sur le meilleur AVEC photo lnh.fr si le
//   tout meilleur n'en a pas (sinon silhouette moche dans le reel).
//
// Usage :
//   DATABASE_URL="<prod>?sslmode=require" REEL_DIR=/abs/path/ pnpm tsx scripts/social/j2-reel/data.ts
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { computeGameweekPlayerPoints } from "@/lib/players/compute-gameweek-best-xi";

const DIR = (process.env.REEL_DIR ?? "").replace(/\/?$/, "/");
if (!DIR || DIR === "/") {
  console.error("REEL_DIR manquant (répertoire de sortie absolu).");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("⚠️  DATABASE_URL pointe sur une base locale — il faut la prod (stats J1 réelles).");
  process.exit(1);
}

// shortName -> { color, salle, ville } — mêmes couleurs que le reel 16-maillots.
const CLUB: Record<string, { color: string; salle: string; ville: string }> = {
  MHB:      { color: "#F0801F", salle: "FDI Stadium",                              ville: "Montpellier" },
  USAM:     { color: "#16B24E", salle: "Le Parnasse",                              ville: "Nîmes" },
  LIMOGES:  { color: "#F5333F", salle: "Palais des Sports de Beaublanc",           ville: "Limoges" },
  CCMHB:    { color: "#4FB6F0", salle: "Colisée de Chartres",                      ville: "Chartres" },
  SAHB:     { color: "#A855F7", salle: "CSI de Sélestat",                          ville: "Sélestat" },
  TREMBLAY: { color: "#F5C518", salle: "Palais des Sports de Tremblay",            ville: "Tremblay-en-France" },
  CRMHB:    { color: "#E2001A", salle: "Glaz Arena",                               ville: "Cesson-Sévigné" },
  HBCN:     { color: "#00A651", salle: "H Arena",                                  ville: "Nantes" },
  SARAN:    { color: "#2E7BD6", salle: "Halle des sports du Bois Joly",            ville: "Saran" },
  PAUC:     { color: "#E2001A", salle: "Arena du Pays d'Aix",                      ville: "Aix-en-Provence" },
  CSMBH:    { color: "#FFD200", salle: "Le Phare",                                 ville: "Chambéry" },
  SRVH:     { color: "#E4123A", salle: "Palais des Sports Jean-Marie Cannizzaro",  ville: "Saint-Raphaël" },
  CAEN:     { color: "#E4002B", salle: "Palais des Sports de Caen",                ville: "Caen" },
  FENIX:    { color: "#5CB8E6", salle: "Palais des Sports André Brouat",           ville: "Toulouse" },
  USDK:     { color: "#E2001A", salle: "Stades de Flandres",                       ville: "Dunkerque" },
  PSG:      { color: "#E30613", salle: "Stade Pierre de Coubertin",               ville: "Paris" },
};

// lnh.fr J02, ordre chrono. Diffuseur vérifié le 2026-09-09 sur le calendrier
// lnh.fr (hd1/hd3/4max => beIN Sport ; htvsmall => Handball TV).
const FIXTURES = [
  { home: "LIMOGES", away: "SARAN",    day: "Jeudi 10 sept.",   time: "20h00", tv: "Handball TV" },
  { home: "SRVH",    away: "USDK",     day: "Vendredi 11 sept.", time: "19h30", tv: "Handball TV" },
  { home: "CCMHB",   away: "TREMBLAY", day: "Vendredi 11 sept.", time: "20h00", tv: "beIN Sport"  },
  { home: "SAHB",    away: "CSMBH",    day: "Vendredi 11 sept.", time: "20h30", tv: "Handball TV" },
  { home: "FENIX",   away: "CAEN",     day: "Vendredi 11 sept.", time: "20h30", tv: "Handball TV" },
  { home: "HBCN",    away: "PAUC",     day: "Samedi 12 sept.",   time: "19h00", tv: "beIN Sport"  },
  { home: "PSG",     away: "CRMHB",    day: "Samedi 12 sept.",   time: "20h00", tv: "Handball TV" },
  { home: "USAM",    away: "MHB",      day: "Dimanche 13 sept.", time: "17h00", tv: "beIN Sport"  },
];

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const gw1 = await prisma.gameweek.findUniqueOrThrow({
    where: { seasonId_number: { seasonId: season.id, number: 1 } },
  });

  const points = await computeGameweekPlayerPoints(gw1.id);
  if (points.size === 0) throw new Error("Aucun point J1 calculé — la J1 est-elle notée ?");

  const players = await prisma.player.findMany({
    where: { id: { in: [...points.keys()] } },
    select: {
      id: true, firstName: true, lastName: true, position: true, photoUrl: true,
      marketValue: true, club: { select: { shortName: true } },
    },
  });

  const byClub = new Map<string, typeof players>();
  for (const p of players) {
    const arr = byClub.get(p.club.shortName) ?? [];
    arr.push(p);
    byClub.set(p.club.shortName, arr);
  }

  const picks: Record<string, { name: string; last: string; first: string; photoUrl: string; pos: string; points: number }> = {};
  for (const sn of Object.keys(CLUB)) {
    const arr = (byClub.get(sn) ?? []).slice().sort((a, b) => {
      const dp = (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0);
      if (dp !== 0) return dp;
      return Number(b.marketValue) - Number(a.marketValue);
    });
    if (!arr.length) { console.warn("AUCUN joueur noté J1 pour", sn); continue; }
    const best = arr[0]!;
    const chosen = best.photoUrl ? best : (arr.find((p) => p.photoUrl) ?? best);
    if (chosen.id !== best.id) {
      console.warn(`⚠️  ${sn} : meilleur J1 = ${best.firstName} ${best.lastName} (${points.get(best.id)} pts) SANS photo → repli sur ${chosen.firstName} ${chosen.lastName} (${points.get(chosen.id)} pts)`);
    }
    picks[sn] = {
      name: `${chosen.firstName} ${chosen.lastName}`,
      last: chosen.lastName,
      first: chosen.firstName,
      photoUrl: chosen.photoUrl ?? "",
      pos: chosen.position,
      points: points.get(chosen.id) ?? 0,
    };
  }

  const out = { gameweek: 2, source: "computeGameweekPlayerPoints(J1)", generatedAt: new Date().toISOString(), club: CLUB, fixtures: FIXTURES, picks };
  writeFileSync(DIR + "data.json", JSON.stringify(out, null, 2));
  console.log("data.json écrit →", DIR + "data.json");
  for (const f of FIXTURES) {
    console.log(`${f.day} ${f.time}  ${f.home} (${picks[f.home]?.name} · ${picks[f.home]?.points}) vs ${f.away} (${picks[f.away]?.name} · ${picks[f.away]?.points})  — ${f.tv}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
