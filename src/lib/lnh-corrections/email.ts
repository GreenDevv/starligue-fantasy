// Contenu de l'email envoyé aux managers dont les points d'une journée ont été
// modifiés après que la LNH a corrigé ses notes a posteriori (elle le fait 2-3
// jours après les matchs). Français uniquement, même raison que l'email de blessure
// (src/lib/email/injury-email.ts) : User n'a pas de champ locale.
//
// Un même utilisateur peut avoir plusieurs équipes impactées (une par ligue) — un
// seul email, qui liste chaque équipe (même logique que l'email de blessure).
//
// Fonction pure, testée (email.test.ts).
import { renderBaseEmail } from "@/lib/email/base-template";
import type { AppliedCorrectionSummary } from "./report";

export interface TeamImpactForEmail {
  teamName: string;
  leagueName: string;
  pointsBefore: number;
  pointsAfter: number;
  delta: number;
  globalRankBefore: number | null;
  globalRankAfter: number | null;
  leagueRankBefore: number | null;
  leagueRankAfter: number | null;
  /** Corrections sur des joueurs que le manager alignait — vide = impact indirect. */
  directCorrections: AppliedCorrectionSummary[];
  indirect: boolean;
}

export interface LnhCorrectionEmailParams {
  gameweekNumber: number;
  teams: TeamImpactForEmail[];
  recapUrl: string;
}

export interface LnhCorrectionEmailContent {
  subject: string;
  html: string;
}

// teamName/leagueName viennent d'utilisateurs (texte libre) — jamais interpolés
// bruts dans un HTML envoyé à un autre destinataire.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPoints(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function fmtDelta(n: number): string {
  if (Math.abs(n) < 0.05) return "±0";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(1).replace(".", ",")}`;
}

function fmtRating(n: number | null): string {
  return n === null ? "—" : n.toFixed(1).replace(".", ",");
}

function ordinal(n: number): string {
  return n === 1 ? "1ᵉʳ" : `${n}ᵉ`;
}

function rankLine(label: string, before: number | null, after: number | null): string | null {
  if (before === null || after === null || before === after) return null;
  const dir = after < before ? "tu remontes" : "tu redescends";
  return `${label} : ${ordinal(before)} → <strong>${ordinal(after)}</strong> (${dir})`;
}

function correctionsList(corrections: AppliedCorrectionSummary[]): string {
  const items = corrections
    .map((c) => {
      const name = `${escapeHtml(c.playerName)} <span style="color:#94A3B8;">(${escapeHtml(c.club)})</span>`;
      return c.ratingChanged
        ? `<li style="margin-bottom:4px;">${name} — note ${fmtRating(c.ratingBefore)} → <strong>${fmtRating(c.ratingAfter)}</strong></li>`
        : `<li style="margin-bottom:4px;">${name} — stats détaillées ajustées (note inchangée)</li>`;
    })
    .join("");
  return `<ul style="margin:6px 0 0;padding-left:20px;">${items}</ul>`;
}

function teamBlock(gw: string, t: TeamImpactForEmail): string {
  const header = `<div style="color:#F1F5F9;font-weight:700;margin-bottom:4px;">${escapeHtml(t.teamName)} <span style="color:#94A3B8;font-weight:400;">— ligue ${escapeHtml(t.leagueName)}</span></div>`;

  const detail = t.indirect
    ? `Aucune note d'un de tes joueurs n'a changé, mais le classement des « leaders de journée » (bonus/malus distribués sur toute la ligue) a été recalculé.`
    : `Joueur(s) concerné(s) :${correctionsList(t.directCorrections)}`;

  const ranks = [
    rankLine("Classement général (fin de journée)", t.globalRankBefore, t.globalRankAfter),
    rankLine("Classement de ligue", t.leagueRankBefore, t.leagueRankAfter),
  ].filter((l): l is string => l !== null);
  const ranksHtml = ranks.length ? `<br/>${ranks.join("<br/>")}` : "";

  return `<div style="margin-bottom:14px;">
    ${header}
    <div style="color:#94A3B8;">${detail}</div>
    <div style="color:#F1F5F9;margin-top:6px;"><strong>Points ${gw} : ${fmtPoints(t.pointsBefore)} → ${fmtPoints(t.pointsAfter)} (${fmtDelta(t.delta)})</strong>${ranksHtml}</div>
  </div>`;
}

export function buildLnhCorrectionEmail(params: LnhCorrectionEmailParams): LnhCorrectionEmailContent {
  const gw = `J${params.gameweekNumber}`;
  const totalDelta = params.teams.reduce((s, t) => s + t.delta, 0);
  const multi = params.teams.length > 1;

  const subject = multi
    ? `${gw} — la LNH a corrigé ses notes : tes points ont été ajustés`
    : totalDelta > 0
      ? `${gw} — la LNH a corrigé ses notes : tu gagnes ${fmtDelta(totalDelta)} pts`
      : totalDelta < 0
        ? `${gw} — la LNH a corrigé ses notes : ${fmtDelta(totalDelta)} pts sur ta ${gw}`
        : `${gw} — la LNH a corrigé ses notes de la journée`;

  const intro = `La LNH a révisé a posteriori certaines notes de performance de la ${gw} — elle le fait généralement 2 à 3 jours après les matchs. Nous avons rejoué le calcul des points de la journée à partir des notes définitives, pour que le classement soit juste.`;

  const teamsHtml = params.teams.map((t) => teamBlock(gw, t)).join("");

  const bodyParagraphs = [
    intro,
    teamsHtml,
    `Ces ajustements sont rares et suivent toujours la source officielle (lnh.fr). Aucune action de ta part n'est nécessaire.`,
  ];

  const preheader = multi
    ? `Le recalcul de la ${gw} a modifié les points de tes équipes.`
    : `Tes points de la ${gw} : ${fmtPoints(params.teams[0]!.pointsBefore)} → ${fmtPoints(params.teams[0]!.pointsAfter)} (${fmtDelta(params.teams[0]!.delta)}).`;

  const html = renderBaseEmail({
    preheader,
    heading: `Correction des notes LNH — Journée ${params.gameweekNumber}`,
    bodyParagraphs,
    cta: { label: "Voir le détail de la journée", url: params.recapUrl },
    footNote: "Tu reçois cet email parce que la correction a modifié tes points sur cette journée précise.",
  });

  return { subject, html };
}
