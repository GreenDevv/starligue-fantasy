// Assemble les données du reel « programme J1 » → data.json
// - fixtures : scrapées de lnh.fr (calendrier J01, 2026/27) — figées ici
// - club meta : couleur (reprise du reel 16-maillots, validée), salle + ville (BEST-GUESS, à vérifier)
// - joueur mis en avant : 1 par club, tirage déterministe (seed=1) pondéré vers les fortes valeurs,
//   uniquement parmi ceux qui ont une photo lnh.fr
import { createRequire } from "node:module";
const require = createRequire("/Users/tish/Projects/starligue-fantasy/package.json");
const { PrismaClient } = require("@prisma/client");
import { writeFileSync } from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/47887ec3-5ee4-4513-ad7b-f4545bc385dc/scratchpad/reelj1/";

// shortName -> { color, salle, ville, logo (public/clubs/*) }
const CLUB = {
  MHB:      { color: "#F0801F", salle: "FDI Stadium",                         ville: "Montpellier" },
  USAM:     { color: "#16B24E", salle: "Parnasse",                            ville: "Nîmes" },
  LIMOGES:  { color: "#F5333F", salle: "Palais des Sports de Beaublanc",      ville: "Limoges" },
  CCMHB:    { color: "#4FB6F0", salle: "Colisée de Chartres",                 ville: "Chartres" },
  SAHB:     { color: "#A855F7", salle: "CSI de Sélestat",                     ville: "Sélestat" },
  TREMBLAY: { color: "#F5C518", salle: "Palais des Sports de Tremblay",       ville: "Tremblay-en-France" },
  CRMHB:    { color: "#E2001A", salle: "Glaz Arena",                          ville: "Cesson-Sévigné" },
  HBCN:     { color: "#00A651", salle: "H Arena",                             ville: "Nantes" },
  SARAN:    { color: "#2E7BD6", salle: "Halle des sports du Bois Joly",       ville: "Saran" },
  PAUC:     { color: "#E2001A", salle: "Arena du Pays d'Aix",                 ville: "Aix-en-Provence" },
  CSMBH:    { color: "#FFD200", salle: "Le Phare",                            ville: "Chambéry" },
  SRVH:     { color: "#E4123A", salle: "Palais des Sports Jean-Marie Cannizzaro", ville: "Saint-Raphaël" },
  CAEN:     { color: "#E4002B", salle: "Palais des Sports de Caen",           ville: "Caen" },
  FENIX:    { color: "#5CB8E6", salle: "Palais des Sports André Brouat",      ville: "Toulouse" },
  USDK:     { color: "#E2001A", salle: "Stades de Flandres",                  ville: "Dunkerque" },
  PSG:      { color: "#E30613", salle: "Stade Pierre de Coubertin",           ville: "Paris" },
};

// lnh J01, ordre chrono. broadcaster: hd* = beIN Sport, htv* = Handball TV
const FIXTURES = [
  { home: "CSMBH", away: "PSG",   day: "Vendredi 4 sept.",  time: "20h00", tv: "beIN Sport"  },
  { home: "LIMOGES", away: "SRVH", day: "Vendredi 4 sept.", time: "20h00", tv: "Handball TV" },
  { home: "MHB", away: "CCMHB",   day: "Vendredi 4 sept.",  time: "20h00", tv: "Handball TV" },
  { home: "CRMHB", away: "USAM",  day: "Vendredi 4 sept.",  time: "20h30", tv: "Handball TV" },
  { home: "PAUC", away: "SAHB",   day: "Samedi 5 sept.",    time: "19h00", tv: "Handball TV" },
  { home: "TREMBLAY", away: "HBCN", day: "Samedi 5 sept.",  time: "19h00", tv: "beIN Sport"  },
  { home: "SARAN", away: "FENIX", day: "Samedi 5 sept.",    time: "20h00", tv: "Handball TV" },
  { home: "CAEN", away: "USDK",   day: "Dimanche 6 sept.",  time: "17h00", tv: "beIN Sport"  },
];

// PRNG déterministe (mulberry32)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SEED = 1;

const prisma = new PrismaClient();
const season = await prisma.season.findFirst({ where: { isActive: true } });
const players = await prisma.player.findMany({
  where: { seasonId: season.id, isActive: true, photoUrl: { not: null } },
  include: { club: { select: { shortName: true } } },
});

const pool = {};
for (const p of players) (pool[p.club.shortName] ||= []).push(p);

const picks = {};
const rand = rng(SEED);
for (const sn of Object.keys(CLUB)) {
  const arr = (pool[sn] || []).slice().sort((a, b) => Number(b.marketValue) - Number(a.marketValue));
  if (!arr.length) { console.warn("AUCUN joueur avec photo pour", sn); continue; }
  // tirage pondéré vers le haut du classement valeur : indice dans le top 10 (ou moins)
  const top = arr.slice(0, Math.min(10, arr.length));
  const idx = Math.floor(rand() * top.length);
  const p = top[idx];
  picks[sn] = { name: `${p.firstName} ${p.lastName}`, last: p.lastName, first: p.firstName, photoUrl: p.photoUrl, pos: p.position };
}

const out = { gameweek: 1, seed: SEED, generatedAt: new Date().toISOString(), club: CLUB, fixtures: FIXTURES, picks };
writeFileSync(DIR + "data.json", JSON.stringify(out, null, 2));
console.log("data.json écrit.");
for (const f of FIXTURES) console.log(`${f.day} ${f.time}  ${f.home} (${picks[f.home]?.name}) vs ${f.away} (${picks[f.away]?.name})  — ${f.tv}`);
await prisma.$disconnect();
