import { MarketView } from "@/components/market/MarketView";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default function MarketPage() {
  const mode = resolveSeasonMode();
  return <MarketView mode={mode} />;
}
