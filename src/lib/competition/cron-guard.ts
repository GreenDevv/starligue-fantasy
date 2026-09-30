// Crons propres au jeu Starligue — ARCHITECTURE.md §35.
//
// Sur le déploiement LBE, un cron adossé à lnh.fr / EHF / API-Sports / actus
// Starligue / Instagram ne doit rien faire (ni requête vers la source, ni écriture
// de données masculines dans la base féminine) : il répond « ignoré » en 200, pour
// qu'un workflow GitHub Actions qui l'appellerait par erreur ne passe pas en échec.
// Appelé APRÈS la vérification du secret : un appel non autorisé reste refusé.

import { NextResponse } from "next/server";
import { getCompetitionProfile, type CompetitionId } from "./profile";

export function starligueOnlyCronSkip(cronName: string, id?: CompetitionId): NextResponse | null {
  const profile = getCompetitionProfile(id);
  if (profile.id === "LNH") return null;
  return NextResponse.json({
    data: { skipped: true, reason: `${cronName} : réservé au jeu Starligue, sans objet sur ${profile.appName}` },
  });
}
