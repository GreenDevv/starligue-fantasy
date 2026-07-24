import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlayerDetailData } from "@/lib/players/player-detail";
import { PlayerCompareView } from "@/components/players/PlayerCompareView";

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await getPlayerDetailData(params.id);
  if (!player) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/market" className="text-sm text-text-muted hover:text-text transition-colors">
        ← Marché
      </Link>
      <PlayerCompareView primary={player} />
    </div>
  );
}
