import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspace, parseGameweek } from "../../../lib/gameweek-workspace";

export const dynamic = "force-static";

export function generateStaticParams() {
  return Array.from({ length: 38 }, (_, index) => ({ gameweek: String(index + 1) }));
}

function number(value: unknown, digits = 1) {
  return typeof value === "number" ? value.toFixed(digits) : "n/a";
}

export default async function GameweekPage({ params }: { params: Promise<{ gameweek: string }> }) {
  const value = (await params).gameweek;
  const gameweekNumber = parseGameweek(value);
  if (!gameweekNumber) notFound();
  const workspace = loadWorkspace();
  const gameweek = workspace.gameweeks.find((item) => item.gameweek === gameweekNumber);
  if (!gameweek || gameweek.status === "missing") {
    return (
      <section className="hero">
        <div className="eyebrow">Missing gameweek</div>
        <h1>GW{gameweekNumber}</h1>
        <p>No recommendation, archive, live result, or post-mortem is available.</p>
        <Link className="evidence-link" href="/gameweeks">Return to the timeline</Link>
      </section>
    );
  }

  const decision = gameweek.decision;
  const recommendation = gameweek.recommendation;
  const postmortem = gameweek.postmortem;
  const readiness = gameweek.readiness?.summary;
  const simulation = decision?.simulation;
  const action = decision?.action ?? recommendation?.recommendedAction;
  const squad = decision?.squad;
  const triggerWarnings = gameweek.triggers?.warnings ?? [];
  const modelChanged = gameweek.previousModelVersion && gameweek.modelVersion && gameweek.previousModelVersion !== gameweek.modelVersion;
  const evidenceComponents = recommendation?.evidenceSnapshot?.components ?? [];
  const sourceFreshness = evidenceComponents.map((component: Record<string, string>) => component.retrievedAt).filter(Boolean).sort().at(-1);
  const partialSources = evidenceComponents.filter((component: Record<string, string>) => component.coverageStatus !== "usable").length;
  const playerName = (playerId: number) => workspace.playerNames[playerId]
    ?? postmortem?.submittedSelection?.picks?.find((pick: Record<string, unknown>) => pick.playerId === playerId)?.name
    ?? `Player ${playerId}`;
  const previous = gameweekNumber > 1 ? gameweekNumber - 1 : null;
  const next = gameweekNumber < 38 ? gameweekNumber + 1 : null;

  return (
    <>
      <section className="hero">
        <div className="eyebrow">GW{gameweek.gameweek} · {gameweek.status}</div>
        <h1>{postmortem ? `${postmortem.manager.totalPoints} points` : "Decision workspace"}</h1>
        <p>{gameweek.archived ? "Metrics resolve to the frozen deadline archive." : "This gameweek is not frozen; working or outcome files may still be provisional."}</p>
        <Link className="evidence-link" href="/gameweeks">All gameweeks</Link>
        <nav className="gameweek-nav" aria-label="Gameweek navigation">
          {previous ? <Link href={`/gameweeks/${previous}`}>← GW{previous}</Link> : <span />}
          {next ? <Link href={`/gameweeks/${next}`}>GW{next} →</Link> : <span />}
        </nav>
      </section>

      <section className="metrics">
        <article className="metric"><span>Status</span><strong>{gameweek.status}</strong><em>{gameweek.archived ? "archive verified" : "not archived"}</em></article>
        <article className="metric"><span>Forecast</span><strong>{number(simulation?.expectedPoints ?? recommendation?.pickTeam?.projectedPoints)}</strong><em>model {gameweek.modelVersion ?? "unavailable"}</em></article>
        <article className="metric"><span>Submitted</span><strong>{postmortem?.manager.totalPoints ?? "n/a"}</strong><em>{postmortem ? `average ${postmortem.manager.gameweekAverage}` : "outcome unavailable"}</em></article>
        <article className="metric"><span>Regret</span><strong>{gameweek.regret?.totals?.submittedRegret ?? "n/a"}</strong><em>{gameweek.regret ? "frozen frontier" : "report unavailable"}</em></article>
      </section>

      {gameweek.status === "live" ? <div className="notice notice-live">Live gameweek. Scores and ranks are provisional.</div> : null}
      {gameweek.status === "provisional" ? <div className="notice">Working gameweek. Do not treat this view as a finalized archive.</div> : null}

      <section className="grid">
        <article className="card">
          <h2>Recommendation</h2>
          {decision || recommendation ? (
            <div className="stack">
              <p>{action?.type ?? action?.action ?? "Decision recorded"}{action?.sellPlayerName ? `: ${action.sellPlayerName} to ${action.buyPlayerName}` : ""}</p>
              <p>Formation: {squad?.formation ?? recommendation?.pickTeam?.formation ?? "n/a"}</p>
              <p>Captain ID: {squad?.captainPlayerId ?? recommendation?.captaincy?.captainPlayerId ?? "n/a"}</p>
            </div>
          ) : <p>No authored recommendation is available.</p>}
        </article>

        <article className="card">
          <h2>Simulation</h2>
          {simulation ? (
            <div className="stack">
              <p>{simulation.sampleCount.toLocaleString("en-GB")} samples across {simulation.candidatesSimulated.toLocaleString("en-GB")} candidates.</p>
              <p>p10 {number(simulation.p10)} · p50 {number(simulation.p50)} · p90 {number(simulation.p90)}</p>
            </div>
          ) : <p>No simulation summary is available.</p>}
        </article>

        <article className="card">
          <h2>Evidence readiness</h2>
          {readiness ? (
            <div className="stack">
              <p>{readiness.ready ?? 0} ready, {readiness.caution ?? 0} caution, {readiness.insufficient ?? 0} insufficient. Selected insufficient: {readiness.selectedInsufficient ?? 0}.</p>
              <p>Freshest source: {sourceFreshness ? new Date(sourceFreshness).toLocaleString("en-GB") : "unavailable"}. Partial or missing components: {partialSources}.</p>
            </div>
          ) : <p>No readiness report is available.</p>}
        </article>

        <article className="card">
          <h2>Triggers</h2>
          <p>{gameweek.triggers?.evaluations?.length ?? 0} evaluations.</p>
          {triggerWarnings.map((warning: string) => <p className="fine" key={warning}>{warning}</p>)}
        </article>
      </section>

      {squad?.startingXI ? (
        <section className="section">
          <h2>Submitted squad</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Role</th><th>Players</th></tr></thead>
              <tbody>
                <tr><td>Starting XI</td><td>{squad.startingXI.map(playerName).join(", ")}</td></tr>
                <tr><td>Bench</td><td>{squad.benchOrder.map(playerName).join(", ")}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid">
        <article className="card">
          <h2>Outcome</h2>
          {postmortem ? (
            <div className="stack">
              <p>Submitted {postmortem.manager.totalPoints}; AI counterfactual {postmortem.aiSelection.actualPointsCounterfactual}.</p>
              <p>Manager override: {postmortem.counterfactuals.managerOverrideDelta > 0 ? "+" : ""}{postmortem.counterfactuals.managerOverrideDelta}.</p>
              <a className="evidence-link" href={postmortem.source} rel="noreferrer" target="_blank">Official result</a>
            </div>
          ) : <p>No finalized post-mortem is available.</p>}
        </article>

        <article className="card">
          <h2>Model lineage</h2>
          <p>Current: {gameweek.modelVersion ?? "unavailable"}</p>
          <p>Previous GW: {gameweek.previousModelVersion ?? "unavailable"}</p>
          <p className="fine">{modelChanged ? "Model version changed from the preceding gameweek." : "No recorded model-version change."}</p>
        </article>
      </section>

      <section className="section">
        <h2>Post-mortem</h2>
        {postmortem ? (
          <ul className="list compact">{postmortem.lessons.map((lesson: string) => <li key={lesson}>{lesson}</li>)}</ul>
        ) : <p>No finalized lessons are available.</p>}
      </section>

      <section className="section">
        <h2>Evidence lineage</h2>
        {gameweek.sources.length ? (
          <ul className="list compact evidence-list">{gameweek.sources.map((source) => <li key={source}><code>{source}</code></li>)}</ul>
        ) : <p>No artifact source resolves for this gameweek.</p>}
      </section>
    </>
  );
}
