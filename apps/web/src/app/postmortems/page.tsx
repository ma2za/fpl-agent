import Link from "next/link";
import { loadWorkspace } from "../../lib/gameweek-workspace";

export const dynamic = "force-static";

export default function PostmortemsPage() {
  const finalized = loadWorkspace().gameweeks.filter((gameweek) => gameweek.postmortem);

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Finalized outcomes</div>
        <h1>Post-mortems</h1>
        <p>Submitted results and frozen decision counterfactuals, ordered newest first.</p>
      </section>
      <section className="archive-list section">
        {finalized.length ? finalized.map((gameweek) => (
          <Link className="archive-row" href={`/gameweeks/${gameweek.gameweek}`} key={gameweek.gameweek}>
            <strong>GW{gameweek.gameweek}</strong>
            <span className="state state-finalized">finalized</span>
            <span>{gameweek.postmortem!.manager.totalPoints} points</span>
            <span>AI {gameweek.postmortem!.aiSelection.actualPointsCounterfactual}</span>
          </Link>
        )) : <p>No finalized post-mortems are available.</p>}
      </section>
    </>
  );
}
