import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getPlayerDetailData } from "@/lib/players/player-detail";
import { PlayerCompareView } from "@/components/players/PlayerCompareView";

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await getPlayerDetailData(params.id);
  if (!player) notFound();
  const t = await getTranslations("players");

  return (
    <div className="flex flex-col gap-5">
      <Link href="/market" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {t("detail.backToMarket")}
      </Link>
      <PlayerCompareView primary={player} />
    </div>
  );
}
