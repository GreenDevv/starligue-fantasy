import { TradesView } from "@/components/team/TradesView";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default function TeamTradesPage() {
  const mode = resolveSeasonMode();
  return <TradesView mode={mode} />;
}
