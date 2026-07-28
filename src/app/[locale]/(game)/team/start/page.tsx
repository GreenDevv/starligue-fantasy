import { StartView } from "@/components/team/StartView";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default function TeamStartPage() {
  const mode = resolveSeasonMode();
  return <StartView mode={mode} />;
}
