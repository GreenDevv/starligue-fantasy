import { BuildView } from "@/components/team/BuildView";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default function BuildPage() {
  const mode = resolveSeasonMode();
  return <BuildView mode={mode} />;
}
