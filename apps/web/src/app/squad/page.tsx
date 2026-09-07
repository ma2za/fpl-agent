import { redirect } from "next/navigation";
import { loadWorkspace } from "../../lib/gameweek-workspace";

export const dynamic = "force-static";

export default function SquadPage() {
  const workspace = loadWorkspace();
  const target = workspace.latestFinalizedGameweek ?? workspace.activeGameweek;
  if (target) redirect(`/gameweeks/${target}`);
  redirect("/gameweeks");
}
