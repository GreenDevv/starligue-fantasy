// Conservé uniquement pour les anciens liens/favoris — l'équipe vit désormais
// sur /leagues/[id] (une équipe fantasy n'existe qu'à l'intérieur d'une ligue).
// Plus jamais linké depuis l'UI.
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { resolveActiveLeagueId } from "@/lib/team/active-league";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { league?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: "/login", locale: params.locale });
    return;
  }

  const leagueId = await resolveActiveLeagueId(session.user.id, searchParams.league);
  redirect({ href: leagueId ? `/leagues/${leagueId}` : "/leagues", locale: params.locale });
}
