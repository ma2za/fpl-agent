export default function SquadPage() {
  return (
    <>
      <section className="hero">
        <div className="eyebrow">Current state</div>
        <h1>Squad</h1>
        <p>
          Manual squad config is the default input. Later milestones will render
          the configured squad and optional public manager data here.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Config source</h2>
          <p>Default: config/squad.ts</p>
        </article>
        <article className="card">
          <h2>Public manager data</h2>
          <p>Planned as read-only support. Private login is out of scope.</p>
        </article>
      </section>
    </>
  );
}
