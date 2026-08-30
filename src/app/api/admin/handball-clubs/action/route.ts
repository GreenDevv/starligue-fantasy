export const dynamic = "force-dynamic";

// GET /api/admin/handball-clubs/action?token=... — liens one-click « Valider » /
// « Rejeter » des emails de modération (§23.5). Auth = le jeton signé lui-même
// (src/lib/admin/club-action-token.ts), pas de session requise. Répond une page
// HTML minimale (le lien est ouvert depuis une boîte mail).
//
// Effet de bord sur GET assumé : actions idempotentes (revérifier un club déjà
// validé, rejeter un club déjà supprimé → message neutre), dommage d'un clic
// accidentel faible et réversible (le membre resaisit son club).
import { prisma } from "@/lib/db";
import { verifyClubActionToken } from "@/lib/admin/club-action-token";
import { geocodeCity } from "@/lib/geo/cities";
import { countryFlag, countryName } from "@/lib/geo/countries";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, message: string, tone: "ok" | "info" | "warn"): Response {
  const accent = tone === "ok" ? "#2DD4BF" : tone === "warn" ? "#F59E0B" : "#94A3B8";
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" /><title>${esc(title)}</title></head>
<body style="margin:0;background:#0E1116;color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 20px;">
    <div style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#F59E0B;">Fantasy Handball</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin:6px 0 32px;">Starligue <span style="color:#2DD4BF;">Fantasy</span></div>
    <div style="background:#171C24;border:1px solid #262D38;border-radius:16px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:${accent};">${esc(title)}</h1>
      <p style="margin:0 0 24px;color:#94A3B8;font-size:15px;line-height:1.6;">${message}</p>
      <a href="${APP_URL}/fr/admin/handball-clubs" style="display:inline-block;background:#2DD4BF;color:#0E1116;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">Ouvrir la modération des clubs</a>
    </div>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const parsed = verifyClubActionToken(token);
  if (!parsed) {
    return page("Lien invalide ou expiré", "Ce lien n'est plus valable (expiré au bout de 7 jours ou altéré).", "warn");
  }

  const club = await prisma.handballClub.findUnique({
    where: { id: parsed.clubId },
    select: { id: true, name: true, city: true, country: true, latitude: true, verified: true, source: true },
  });
  if (!club) {
    return page("Club déjà traité", "Ce club a déjà été validé, rejeté ou fusionné entre-temps.", "info");
  }

  const where = [club.city ? esc(club.city) : null, `${countryFlag(club.country)} ${countryName(club.country, "fr")}`]
    .filter(Boolean)
    .join(" · ");
  const label = `<strong>${esc(club.name)}</strong><br /><span style="font-size:13px;">${where}</span>`;

  if (parsed.action === "verify") {
    if (club.verified) {
      return page("Déjà validé", `${label}<br /><br />est déjà visible sur la carte et le classement.`, "info");
    }
    const coords = club.latitude == null && club.city ? geocodeCity(club.city, club.country) : null;
    await prisma.handballClub.update({ where: { id: club.id }, data: { verified: true, ...(coords ?? {}) } });
    return page(
      "Club validé ✅",
      `${label}<br /><br />apparaît maintenant sur la carte des managers et le classement des clubs.`,
      "ok",
    );
  }

  // reject
  if (club.source !== "MANUAL" || club.verified) {
    return page(
      "Action impossible",
      `${label}<br /><br />ne peut pas être rejeté par ce lien (déjà validé, ou club de l'annuaire). Passe par la modération.`,
      "warn",
    );
  }
  await prisma.handballClub.delete({ where: { id: club.id } });
  return page(
    "Club rejeté 🗑",
    `${label}<br /><br />a été supprimé. Le membre qui l'avait indiqué se retrouve sans club et pourra en saisir un autre.`,
    "ok",
  );
}
