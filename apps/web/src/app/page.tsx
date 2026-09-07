import Link from "next/link";
import { loadWorkspace } from "../lib/gameweek-workspace";

export default function HomePage() {
  const workspace = loadWorkspace();

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Recommendation-only FPL workspace</div>
        <h1>fpl-agent</h1>
        <p>
          A forkable repo for coding agents and developers to inspect FPL data,
          squad state, rules, news, and methodology before writing manual
          recommendations for a human manager.
        </p>
        <div className="status">{workspace.phase.replaceAll("_", " ")} · no authenticated actions</div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Current workspace</h2>
          <p>
            {workspace.activeGameweek ? `GW${workspace.activeGameweek}` : "No active gameweek"} is resolved from official competition state.
          </p>
          <Link className="evidence-link" href="/gameweeks">Open gameweeks</Link>
        </article>
        <article className="card">
          <h2>Public data first</h2>
          <p>
            Public FPL API data is cached for transparent, repeatable analysis.
          </p>
        </article>
        <article className="card">
          <h2>Agent-readable</h2>
          <p>
            Docs, config, and output folders are structured so Codex, Claude
            Code, or a developer can reason from files instead of hidden state.
          </p>
        </article>
      </section>
    </>
  );
}
