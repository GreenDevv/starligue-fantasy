import { prisma } from "@/lib/db";
import { renderBaseEmail } from "@/lib/email/base-template";
import { getResendClient, EMAIL_FROM } from "@/lib/email/resend-client";

// One-off : prévient par email chaque manager crédité de « points d'accueil »
// (FantasyLineup.isCatchup, ARCHITECTURE.md §13.7) qu'une règle a été tranchée
// pour les arrivées après une journée déjà jouée, et de combien de points il a
// été crédité. Français uniquement (comme injury-email.ts : pas de locale en
// base). Idempotence : AUCUNE — à ne lancer qu'une fois. `--dry-run` affiche sans
// envoyer.
//
// Requiert DATABASE_URL = prod Railway (?sslmode=require) + RESEND_API_KEY /
// EMAIL_FROM / NEXT_PUBLIC_APP_URL. cf. memory prod_database_access.
//   DATABASE_URL="<prod>?sslmode=require" RESEND_API_KEY=... EMAIL_FROM=contact@starliguefantasy.fr \
//   NEXT_PUBLIC_APP_URL=https://starliguefantasy.fr \
//   npx tsx scripts/send-catchup-announcement.ts --dry-run

const DRY_RUN = process.argv.includes("--dry-run");
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function frGameweekList(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0] === 1 ? "la première journée (J1)" : `la journée J${sorted[0]}`;
  }
  const labels = sorted.map((n) => `J${n}`);
  return `les journées ${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/rlwy\.net|proxy\.rlwy|railway/.test(dbUrl)) {
    console.error(
      "DATABASE_URL ne ressemble pas à la prod Railway. Refus (piège base locale, cf. memory prod_database_access).\n" +
        `  DATABASE_URL="${dbUrl.slice(0, 40)}..."`,
    );
    process.exit(1);
  }
  if (!DRY_RUN && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante (obligatoire hors --dry-run).");
    process.exit(1);
  }

  const factorRaw = await prisma.gameConfig.findUnique({ where: { key: "CATCHUP_FACTOR" } });
  const factorPct = Math.round(parseFloat(factorRaw?.value ?? "0.7") * 100);

  const rows = await prisma.fantasyLineup.findMany({
    where: { isCatchup: true },
    select: {
      points: true,
      gameweek: { select: { number: true } },
      fantasyTeam: {
        select: {
          user: { select: { name: true, email: true } },
          league: { select: { name: true } },
        },
      },
    },
  });

  // Regroupe par utilisateur (un manager pourrait avoir des lignes d'accueil dans
  // plusieurs ligues — ici 1 chacun, mais on gère le cas).
  type Bucket = {
    email: string;
    firstName: string;
    leagues: Set<string>;
    gameweeks: Set<number>;
    totalCredit: number;
  };
  const byUser = new Map<string, Bucket>();
  for (const r of rows) {
    const email = r.fantasyTeam.user.email;
    const b =
      byUser.get(email) ??
      {
        email,
        firstName: (r.fantasyTeam.user.name ?? "").trim().split(/\s+/)[0] || "Coach",
        leagues: new Set<string>(),
        gameweeks: new Set<number>(),
        totalCredit: 0,
      };
    b.leagues.add(r.fantasyTeam.league.name.trim());
    b.gameweeks.add(r.gameweek.number);
    b.totalCredit += Number(r.points ?? 0);
    byUser.set(email, b);
  }

  console.log(`${byUser.size} destinataire(s)${DRY_RUN ? " — DRY RUN, aucun envoi" : ""}\n`);

  const resend = DRY_RUN ? null : getResendClient();
  let sent = 0;

  for (const b of byUser.values()) {
    const credit = Math.round(b.totalCredit * 10) / 10;
    const gwList = frGameweekList([...b.gameweeks]);
    const leagueNames = [...b.leagues].map((l) => `« ${escapeHtml(l)} »`).join(" et ");

    const subject = `Tu démarres avec ${credit.toString().replace(".", ",")} points — voici pourquoi`;
    const heading = "Une règle pour les arrivées après le coup d'envoi";
    const intro = `Salut ${escapeHtml(b.firstName)}, tu as rejoint Starligue Fantasy après le coup d'envoi de ${gwList}, que tu n'as donc pas pu jouer avec ton effectif dans ta ligue ${leagueNames}.`;

    const html = renderBaseEmail({
      preheader: `Tu as été crédité de ${credit.toString().replace(".", ",")} points d'accueil.`,
      heading,
      bodyParagraphs: [
        intro,
        `Pour que ça ne te mette pas hors course au classement, on a tranché une règle qui vaut pour tous les managers dans ce cas : chaque journée disputée avant ton arrivée te crédite <strong>${factorPct}&nbsp;% de la performance médiane des managers</strong> sur cette journée-là. Ni le score de ceux qui ont cartonné, ni zéro — de quoi rester dans la course sans partir avantagé.`,
        `Résultat : tu démarres avec <strong>${credit.toString().replace(".", ",")} points</strong> au compteur. À partir de la prochaine journée, tout se joue sur ton vrai effectif — et cette règle te couvrira automatiquement si tu manques une journée plus tard.`,
      ],
      cta: { label: "Voir mon équipe", url: `${SITE_URL}/team` },
      footNote: "Une question sur ce calcul ? Réponds simplement à ce message.",
    });

    if (DRY_RUN) {
      console.log(`— ${b.email} (${b.firstName})`);
      console.log(`  sujet : ${subject}`);
      console.log(`  ${intro}`);
      console.log(`  crédit : ${credit} pts | journées : ${[...b.gameweeks].join(", ")} | ligue(s) : ${[...b.leagues].join(", ")}\n`);
      continue;
    }

    const { error } = await resend!.emails.send({ from: EMAIL_FROM, to: b.email, subject, html });
    if (error) {
      console.error(`  ✗ ${b.email} — ${error.message}`);
    } else {
      console.log(`  ✓ ${b.email}`);
      sent++;
    }
  }

  if (!DRY_RUN) console.log(`\n${sent}/${byUser.size} email(s) envoyé(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
