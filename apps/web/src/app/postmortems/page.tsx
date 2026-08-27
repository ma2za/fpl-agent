import postmortemJson from "../../../../../packages/content/postmortems/gw-1.json";
import { GameweekPostmortemSchema } from "../../../../../packages/agent/src/postmortem";

const postmortem = GameweekPostmortemSchema.parse(postmortemJson);

export default function PostmortemsPage() {
  const starters = postmortem.submittedSelection.picks.filter((pick) => pick.role === "starter");
  const bench = postmortem.submittedSelection.picks.filter((pick) => pick.role === "bench");

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Gameweek 1 review</div>
        <h1>47 points</h1>
        <p>
          The submitted team finished three points below the gameweek average.
          Three manager overrides improved the frozen AI selection by three points after automatic substitutions.
        </p>
        <a className="evidence-link" href={postmortem.source} rel="noreferrer" target="_blank">
          Official FPL result
        </a>
      </section>

      <section className="metrics">
        <article className="metric">
          <span>GW points</span>
          <strong>{postmortem.manager.totalPoints}</strong>
          <em>Average {postmortem.manager.gameweekAverage}</em>
        </article>
        <article className="metric">
          <span>Manager overrides</span>
          <strong>+{postmortem.counterfactuals.managerOverrideDelta}</strong>
          <em>AI counterfactual {postmortem.aiSelection.actualPointsCounterfactual}</em>
        </article>
        <article className="metric">
          <span>GW rank</span>
          <strong>{postmortem.manager.gameweekRank.toLocaleString("en-GB")}</strong>
          <em>{postmortem.manager.totalPlayers.toLocaleString("en-GB")} managers</em>
        </article>
        <article className="metric">
          <span>Squad value</span>
          <strong>£{postmortem.manager.teamValue.toFixed(1)}</strong>
          <em>£{postmortem.manager.bank.toFixed(1)} bank</em>
        </article>
      </section>

      <section className="section">
        <h2>Manager overrides</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>AI pick</th><th>Submitted pick</th><th>Points</th></tr>
            </thead>
            <tbody>
              {postmortem.managerOverrides.map((item) => (
                <tr key={item.outPlayerId}>
                  <td>{item.outName} ({item.outPoints})</td>
                  <td>{item.inName} ({item.inPoints})</td>
                  <td>{item.pointsDelta > 0 ? `+${item.pointsDelta}` : item.pointsDelta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Submitted team</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Player</th><th>Position</th><th>Role</th><th>Points</th></tr>
            </thead>
            <tbody>
              {[...starters, ...bench].map((pick) => (
                <tr key={pick.playerId}>
                  <td>{pick.name}</td>
                  <td>{pick.position}</td>
                  <td>{pick.role === "starter" ? (pick.multiplier === 2 ? "Captain" : "Starter") : "Bench"}</td>
                  <td>{pick.role === "starter" ? pick.countedPoints : pick.rawPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Review</h2>
        <ul className="list">
          {postmortem.lessons.map((lesson) => <li key={lesson}>{lesson}</li>)}
        </ul>
      </section>
    </>
  );
}
