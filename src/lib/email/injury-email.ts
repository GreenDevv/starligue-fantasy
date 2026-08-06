// Contenu de l'email envoyé aux utilisateurs qui ont un joueur déclaré blessé dans
// leur effectif (déclenché depuis src/lib/notifications/notify-player-injured.ts,
// lui-même appelé best-effort par PUT /api/admin/players/[id] à la déclaration —
// jamais à la levée de blessure). Français uniquement (décision explicite,
// 2026-08-06) : contrairement à l'email de mot de passe oublié, on n'a pas la
// langue préférée de chaque destinataire en base (User n'a pas de champ locale) —
// ajouter les 7 autres langues nécessiterait d'abord cette migration.
import type { Position } from "@prisma/client";
import { renderBaseEmail } from "./base-template";
import frLabels from "../../../messages/fr/labels.json";

export interface InjuryEmailTeam {
  teamName: string;
  leagueName: string;
  jokersLeft: number;
}

export interface InjuryEmailParams {
  playerFirstName: string;
  playerLastName: string;
  position: Position;
  clubShortName: string;
  marketValue: number;
  teams: InjuryEmailTeam[];
  transfersUrl: string;
}

export interface InjuryEmailContent {
  subject: string;
  html: string;
}

// teamName/leagueName viennent d'utilisateurs (nom de ligue/équipe librement
// choisi) — jamais interpolés tels quels dans le HTML envoyé à un AUTRE
// utilisateur, même logique que src/lib/news/html-to-text.ts pour le contenu
// scrapé de sites tiers.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function jokersLine(jokersLeft: number): string {
  if (jokersLeft <= 0) return "aucun joker médical restant";
  if (jokersLeft === 1) return "1 joker médical restant";
  return `${jokersLeft} jokers médicaux restants`;
}

function teamsBlock(teams: InjuryEmailTeam[]): string {
  if (teams.length === 1) {
    const t = teams[0]!;
    return `<strong>${escapeHtml(t.teamName)}</strong> (ligue ${escapeHtml(t.leagueName)}) — ${jokersLine(t.jokersLeft)} dans cette ligue cette saison.`;
  }
  const items = teams
    .map(
      (t) =>
        `<li style="margin-bottom:6px;"><strong>${escapeHtml(t.teamName)}</strong> (ligue ${escapeHtml(t.leagueName)}) — ${jokersLine(t.jokersLeft)} dans cette ligue cette saison.</li>`
    )
    .join("");
  return `<ul style="margin:0;padding-left:20px;">${items}</ul>`;
}

export function buildInjuryEmail(params: InjuryEmailParams): InjuryEmailContent {
  const playerName = `${escapeHtml(params.playerFirstName)} ${escapeHtml(params.playerLastName)}`;
  const positionLabel = frLabels.position[params.position];
  const value = params.marketValue.toFixed(1);

  const subject = `${params.playerFirstName} ${params.playerLastName} blessé — remplace-le dans ton effectif`;
  const heading = `${playerName} est blessé pour le reste de la saison`;
  const intro = `${playerName} (${positionLabel}, ${escapeHtml(params.clubShortName)}) vient d'être déclaré blessé pour le reste de la saison. Tu l'as dans ton effectif :`;

  const html = renderBaseEmail({
    preheader: intro,
    heading,
    bodyParagraphs: [
      intro,
      teamsBlock(params.teams),
      `Tu peux le remplacer dès maintenant par un joueur du même poste (${positionLabel}) — même en dehors des fenêtres de transfert habituelles, grâce au joker médical. Sa valeur actuelle (${value}M) sera créditée à ton budget au moment de la vente (elle peut légèrement évoluer d'ici là).`,
    ],
    cta: { label: `Remplacer ${playerName}`, url: params.transfersUrl },
    footNote: "Pas d'urgence dans l'heure : le joker reste utilisable à tout moment jusqu'à la fin de la saison.",
  });

  return { subject, html };
}
