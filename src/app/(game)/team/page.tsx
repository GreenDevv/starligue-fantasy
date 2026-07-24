// Conservé uniquement pour les anciens liens/favoris — l'équipe vit désormais
// sur /leagues/[id] (une équipe fantasy n'existe qu'à l'intérieur d'une ligue).
// Plus jamais linké depuis l'UI.
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveActiveLeagueId } from "@/lib/team/active-league";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { league?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const leagueId = await resolveActiveLeagueId(session.user.id, searchParams.league);
  redirect(leagueId ? `/leagues/${leagueId}` : "/leagues");
}
