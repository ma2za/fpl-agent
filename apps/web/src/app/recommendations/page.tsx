import { redirect } from "next/navigation";
import { loadWorkspace } from "../../lib/gameweek-workspace";

export const dynamic = "force-static";

export default function RecommendationsPage() {
  const workspace = loadWorkspace();
  const target = workspace.activeGameweek
    ?? workspace.gameweeks.find((gameweek) => gameweek.recommendation || gameweek.decision)?.gameweek;
  if (target) redirect(`/gameweeks/${target}`);
  redirect("/gameweeks");
}
