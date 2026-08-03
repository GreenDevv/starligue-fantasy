import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getPlayerDetailData } from "@/lib/players/player-detail";
import { PlayerCompareView } from "@/components/players/PlayerCompareView";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  const player = await getPlayerDetailData(params.id);
  if (!player) notFound();
  const t = await getTranslations("players");

  // Deux points d'entrée possibles vers cette fiche : le marché Fantasy
  // (connecté) ou la liste publique /players (mode Starligue) — ?from=players
  // ajouté par PlayersListView permet de proposer le bon lien retour plutôt
  // que de renvoyer un visiteur non connecté vers /market (protégée).
  const fromPlayers = searchParams.from === "players";
  const backHref = fromPlayers ? "/players" : "/market";
  const backLabel = fromPlayers ? t("detail.backToPlayers") : t("detail.backToMarket");

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className="text-sm text-text-muted hover:text-text transition-colors">
        ← {backLabel}
      </Link>
      <PlayerCompareView primary={player} />
    </div>
  );
}
