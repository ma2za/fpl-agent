export default function MethodologyPage() {
  return (
    <>
      <section className="hero">
        <div className="eyebrow">Transparent process</div>
        <h1>Methodology</h1>
        <p>
          The first complete model will be deterministic, inspectable, and based
          on public FPL data plus local configuration.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Decision inputs</h2>
          <ol className="list">
            <li>Public FPL API data</li>
            <li>Manual squad config</li>
            <li>FPL rules and legality checks</li>
            <li>Human-reviewed news notes</li>
          </ol>
        </article>
        <article className="card">
          <h2>Output</h2>
          <p>
            Recommendations are written as local files and must be applied
            manually by the human manager.
          </p>
        </article>
      </section>
    </>
  );
}
