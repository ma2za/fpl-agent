import Link from "next/link";
import { calibrationSummary, loadWorkspace } from "../../lib/gameweek-workspace";

export const dynamic = "force-static";

export default function GameweeksPage() {
  const workspace = loadWorkspace();
  const visible = workspace.gameweeks.filter((gameweek) => gameweek.status !== "missing" || gameweek.gameweek <= (workspace.activeGameweek ?? 1));
  const calibration = calibrationSummary(workspace.calibration);

  return (
    <>
      <section className="hero">
        <div className="eyebrow">{workspace.phase.replaceAll("_", " ")}</div>
        <h1>Gameweek workspace</h1>
        <p>Current decisions, live work, finalized outcomes, and frozen archives in one read-only timeline.</p>
      </section>

      <section className="metrics">
        <article className="metric"><span>Active</span><strong>{workspace.activeGameweek ? `GW${workspace.activeGameweek}` : "None"}</strong><em>competition state</em></article>
        <article className="metric"><span>Latest final</span><strong>{workspace.latestFinalizedGameweek ? `GW${workspace.latestFinalizedGameweek}` : "None"}</strong><em>official outcome recorded</em></article>
        <article className="metric"><span>Calibration rows</span><strong>{calibration.rows.toLocaleString("en-GB")}</strong><em>{calibration.cohorts} cohorts</em></article>
      </section>

      <section className="section">
        <h2>Season timeline</h2>
        <div className="archive-list">
          {visible.map((gameweek) => (
            <Link className="archive-row" href={`/gameweeks/${gameweek.gameweek}`} key={gameweek.gameweek}>
              <strong>GW{gameweek.gameweek}</strong>
              <span className={`state state-${gameweek.status}`}>{gameweek.status}</span>
              <span>{gameweek.archived ? "Frozen archive" : gameweek.sources.length ? "Working files" : "No workspace data"}</span>
              <span>{gameweek.deadline ? new Date(gameweek.deadline).toLocaleString("en-GB") : "Deadline unavailable"}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Calibration cohorts</h2>
        {workspace.calibration?.cohorts?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cohort</th><th>Value</th><th>Rows</th><th>Points MAE</th><th>Start Brier</th></tr></thead>
              <tbody>
                {workspace.calibration.cohorts
                  .filter((cohort: Record<string, string>) => ["overall", "position", "model_version"].includes(cohort.dimension))
                  .map((cohort: Record<string, string | number>) => (
                    <tr key={`${cohort.dimension}-${cohort.value}`}>
                      <td>{cohort.dimension}</td><td>{cohort.value}</td><td>{cohort.sampleSize}</td>
                      <td>{Number(cohort.meanAbsolutePointsError).toFixed(3)}</td><td>{Number(cohort.startBrier).toFixed(3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : <p>No calibration cohorts are available.</p>}
      </section>
    </>
  );
}
