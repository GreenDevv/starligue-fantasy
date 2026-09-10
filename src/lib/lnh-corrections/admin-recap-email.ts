// Email envoyé aux admins par le cron hebdo quand il a appliqué des corrections
// LNH a posteriori sur une ou plusieurs journées : le cron aligne les données sur
// les notes officielles tout seul, mais l'envoi des emails aux managers reste une
// décision humaine — ce mail rappelle qu'il y a des lots à relire.
import { renderBaseEmail } from "@/lib/email/base-template";

export interface AdminRecapBatch {
  gameweekNumber: number;
  correctionCount: number;
  impactedTeams: number;
  ratingCorrections: number;
  topDeltas: { teamName: string; delta: number }[];
}

function fmtDelta(n: number): string {
  if (Math.abs(n) < 0.05) return "±0";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}`;
}

export function buildAdminCorrectionRecapEmail(params: {
  batches: AdminRecapBatch[];
  adminUrl: string;
}): { subject: string; html: string } {
  const gwList = params.batches.map((b) => `J${b.gameweekNumber}`).join(", ");
  const totalTeams = params.batches.reduce((s, b) => s + b.impactedTeams, 0);

  const subject = `Corrections LNH appliquées (${gwList}) — ${totalTeams} manager(s) à prévenir`;

  const blocks = params.batches
    .map((b) => {
      const top = b.topDeltas
        .slice(0, 5)
        .map((d) => `<li style="margin-bottom:3px;">${d.teamName} : <strong>${fmtDelta(d.delta)}</strong></li>`)
        .join("");
      return `<div style="margin-bottom:14px;">
        <div style="color:#F1F5F9;font-weight:700;">Journée ${b.gameweekNumber}</div>
        <div style="color:#94A3B8;">${b.correctionCount} correction(s) appliquée(s) (dont ${b.ratingCorrections} sur une note) · ${b.impactedTeams} équipe(s) impactée(s), points et classement déjà recalculés.</div>
        ${top ? `<ul style="margin:6px 0 0;padding-left:20px;color:#94A3B8;">${top}</ul>` : ""}
      </div>`;
    })
    .join("");

  const html = renderBaseEmail({
    preheader: `${gwList} : corrections appliquées et scoring rejoué. ${totalTeams} manager(s) en attente de notification.`,
    heading: "Corrections LNH appliquées par le cron",
    bodyParagraphs: [
      `Le cron hebdo a détecté que la LNH avait révisé des notes a posteriori. Les stats ont été corrigées et le calcul des points des journées concernées a été rejoué — le classement est déjà à jour.`,
      blocks,
      `Les managers impactés <strong>n'ont pas encore été prévenus</strong>. Relis les lots dans l'écran admin et déclenche (ou non) l'envoi des emails d'explication.`,
    ],
    cta: { label: "Relire et notifier", url: params.adminUrl },
    footNote: "Si tu ne fais rien, aucun email manager ne partira — mais le classement reste corrigé.",
  });

  return { subject, html };
}
