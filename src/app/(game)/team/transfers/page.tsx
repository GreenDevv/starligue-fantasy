import { TransfersView } from "@/components/team/TransfersView";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default function TeamTransfersPage() {
  const mode = resolveSeasonMode();
  return <TransfersView mode={mode} />;
}
