// Va chercher le logo d'un club d'origine dès qu'un membre le rejoint —
// ARCHITECTURE.md §23. Best-effort, jamais bloquant : appelé en fire-and-forget
// depuis PUT /api/account et POST /api/auth/register, juste après la
// résolution du club (src/lib/clubs/home-club-input.ts).
//
// Source : le champ ACF `logo_club` d'une fiche monclub.ffhandball.fr (voir
// ffhandball-clubs.provider.ts), servi par le CDN média officiel
// media-logos-clubs.ffhandball.fr — déjà détouré par les clubs eux-mêmes
// (écusson/crest), pas de retraitement nécessaire. Seuls les clubs FFHANDBALL
// ont une fiche à relire (un club MANUAL/saisie libre n'a par définition pas
// été trouvé dans l'annuaire, donc pas de logo à en tirer).
//
// Idempotent : ne fait rien si le club a déjà un logoUrl → le premier membre
// qui rejoint un club déclenche le fetch, les suivants sont des no-op. Pour
// les clubs qui avaient déjà des membres avant ce module, voir
// scripts/backfill-handball-club-logos.ts.
import { prisma } from "@/lib/db";
import { createFfhandballClubsProvider, ffhandballLogoUrl } from "@/lib/data-providers/ffhandball-clubs.provider";

const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";
const CHECK_TIMEOUT_MS = 8_000;

/** Le CDN renvoie parfois 503 pour un club qui a renseigné `logo_club` sans
 *  fichier exploitable derrière — on vérifie avant d'enregistrer une URL morte. */
async function isImageAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureHandballClubLogo(clubId: string): Promise<void> {
  const club = await prisma.handballClub.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true, source: true, logoUrl: true },
  });
  if (!club || club.source !== "FFHANDBALL" || club.logoUrl) return;

  const provider = createFfhandballClubsProvider();
  const external = await provider.fetchClub(club.slug);
  if (!external?.logoFilename) return;

  const logoUrl = ffhandballLogoUrl(external.logoFilename);
  if (!(await isImageAvailable(logoUrl))) return;

  await prisma.handballClub.update({ where: { id: clubId }, data: { logoUrl } });
}
