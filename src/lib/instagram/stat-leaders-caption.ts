// Légendes des 3 posts carrousel "Leaders Starligue" publiés après chaque journée
// notée (cron src/app/api/cron/post-stat-leaders/route.ts). Fonction pure, ton
// identique aux posts précédents (emojis + hashtags, décision actée dans
// [[instagram_publishing]] — départ volontaire du ton sobre du site lui-même).
export type StatLeadersPostKind = "attack" | "goalkeepers" | "defense";

const HASHTAGS = "#StarligueFantasy #Handball #FantasyHandball #DaikinStarLigue #LNH";

export function buildStatLeadersCaption(kind: StatLeadersPostKind, gameweekNumber: number): string {
  switch (kind) {
    case "attack":
      return `🤾 LEADERS STARLIGUE — Journée ${gameweekNumber} 🥅\nButs, penaltys, dernières passes... qui régale en attaque cette saison ? Fais défiler ➡️\n\n${HASHTAGS}`;
    case "goalkeepers":
      return `🧤 LE DERNIER REMPART — Journée ${gameweekNumber} 🧤\nLes gardiens qui claquent le plus d'arrêts cette saison, en total et en moyenne par match.\n\n${HASHTAGS}`;
    case "defense":
      return `🛡️ LE SALE BOULOT — Journée ${gameweekNumber} 🛡️\nInterceptions, contres, neutralisations : les taulards de la défense Starligue. Fais défiler ➡️\n\n${HASHTAGS}`;
  }
}
