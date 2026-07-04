export default function HomePage() {
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
        <div className="status">No login. No automation. No submitted changes.</div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Manual workflow</h2>
          <p>
            The agent writes local recommendation files. The human manager reads
            the checklist and applies any accepted changes inside official FPL.
          </p>
        </article>
        <article className="card">
          <h2>Public data first</h2>
          <p>
            Future milestones will fetch public FPL API data and cache it for
            transparent, repeatable analysis.
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
