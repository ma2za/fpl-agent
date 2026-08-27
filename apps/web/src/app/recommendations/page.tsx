import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  LegalityReportSchema,
  FixtureHorizonReportSchema,
  MinutesRiskReportSchema,
  parseArtifactJson,
  RecommendationArtifactSchema,
  SquadRiskReportSchema,
  type ArtifactSchema
} from "@fpl-agent/agent";

type Player = {
  id: number;
  name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  price: number;
};

type Recommendation = {
  artifactKind?: "agent_decision";
  status?: string;
  gameweek: number;
  deadline: string;
  deadlineStatus: string;
  dataMode: string;
  squadBefore: {
    players: Player[];
    bank: number;
  };
  pickTeam: {
    formation: string;
    startingXI: number[];
    benchOrder: number[];
    projectedPoints: number;
  } | null;
  captaincy: {
    captainPlayerId: number;
    viceCaptainPlayerId: number;
    explanation: string;
  } | null;
  chip: {
    chip: string;
    reasons: string[];
  } | null;
  confidence: {
    label: string;
    explanation: string;
  } | null;
  decisionAnalysis?: {
    summary: string;
    squadStructure: string[];
    playerDecisions: Array<{
      playerId: number;
      playerName?: string;
      role: string;
      whyPicked: string[];
      comparedAgainst: Array<{
        name: string;
        whyNot: string[];
      }>;
      evidence: string[];
      materialRisk?: string;
      riskResponse?: string;
    }>;
    captaincy: {
      captainPlayerId: number;
      whyCaptain: string[];
      comparedAgainst: Array<{
        name: string;
        whyNot: string[];
      }>;
      evidence: string[];
    };
    keyOmissions: Array<{
      name: string;
      whyOmitted: string[];
      wouldReconsiderIf: string[];
      evidence: string[];
    }>;
  };
  risks: string[];
  whatWouldChangeMyMind: string[];
};

type ToolEvidenceArtifact = {
  artifactKind: "tool_evidence";
  tool: string;
  payload: unknown;
};

function recommendationFromArtifact(artifact: Recommendation | ToolEvidenceArtifact | null) {
  if (artifact?.artifactKind === "tool_evidence") {
    return artifact.tool === "recommendation-template"
      ? artifact.payload as Recommendation
      : null;
  }

  return artifact;
}

type LegalityReport = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

type RiskReport = {
  summary: {
    high: number;
    medium: number;
    low: number;
    evidenceGaps: number;
  };
  playerRisks: Array<{
    name: string;
    position: string;
    level: string;
    reasons: string[];
  }>;
  structureRisks: Array<{
    risk: string;
    level: string;
    message: string;
  }>;
  evidenceGaps: Array<{
    area: string;
    status: string;
    message: string;
  }>;
};

type MinutesRiskReport = {
  summary: {
    secure: number;
    watch: number;
    risky: number;
    unknown: number;
    starterWatchOrWorse: number;
  };
  items: Array<{
    playerId: number;
    webName: string;
    teamName: string;
    position: string;
    selected: boolean;
    starting: boolean;
    benchPosition: number | null;
    riskLevel: string;
    historicalConfidence: string;
    predictedLineupConfidence: string;
    minutes: number | null;
  }>;
};

type FixtureHorizonReport = {
  warnings: string[];
  teams: Array<{
    teamId: number;
    teamName: string;
    horizons: Array<{
      gameweeks: 1 | 3 | 6;
      attack: { averageDifficulty: number | null; label: string; confidence: string };
      defence: { averageDifficulty: number | null; label: string; confidence: string };
      blankGameweeks: number[];
      doubleGameweeks: number[];
      shortRestCount: number;
    }>;
    swing: { attack: string; defence: string };
  }>;
};

function readJson<T>(relativePath: string, schema: ArtifactSchema) {
  const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "..", relativePath);

  if (!existsSync(filePath)) {
    return null;
  }

  return parseArtifactJson(readFileSync(filePath, "utf8"), schema, filePath) as T;
}

function playerName(players: Player[], playerId: number) {
  return players.find((player) => player.id === playerId)?.name ?? `Player ${playerId}`;
}

function playersByIds(players: Player[], ids: number[]) {
  return ids.map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player));
}

function budgetUsed(players: Player[]) {
  return players.reduce((sum, player) => sum + player.price, 0);
}

function playersByPosition(players: Player[]) {
  return {
    GKP: players.filter((player) => player.position === "GKP"),
    DEF: players.filter((player) => player.position === "DEF"),
    MID: players.filter((player) => player.position === "MID"),
    FWD: players.filter((player) => player.position === "FWD")
  };
}

export default function RecommendationsPage() {
  const recommendation = recommendationFromArtifact(
    readJson<Recommendation | ToolEvidenceArtifact>(
      "packages/content/recommendations/gw-1/recommendation.json",
      RecommendationArtifactSchema
    )
  );
  const legality = readJson<LegalityReport>(
    "packages/content/recommendations/gw-1/legality-report.json",
    LegalityReportSchema
  );
  const riskReport = readJson<RiskReport>(
    "packages/content/recommendations/gw-1/risk-report.json",
    SquadRiskReportSchema
  );
  const minutesRiskReport = readJson<MinutesRiskReport>(
    "packages/content/recommendations/gw-1/minutes-risk-report.json",
    MinutesRiskReportSchema
  );
  const fixtureHorizonReport = readJson<FixtureHorizonReport>(
    "packages/content/recommendations/gw-1/fixture-horizon-report.json",
    FixtureHorizonReportSchema
  );

  if (!recommendation) {
    return (
      <>
        <section className="hero">
          <div className="eyebrow">Archive</div>
          <h1>Recommendations</h1>
          <p>No authored recommendation is available yet.</p>
        </section>
      </>
    );
  }

  if (recommendation.status === "agent_decision_required" || !recommendation.pickTeam || !recommendation.captaincy || !recommendation.chip) {
    return (
      <>
        <section className="hero">
          <div className="eyebrow">GW{recommendation.gameweek} evidence</div>
          <h1>Recommendations</h1>
          <p>
            The previous GW1 recommendation has been cleared. Evidence is ready
            for an agent-authored recommendation with explicit source references.
          </p>
        </section>

        <section className="metrics">
          <article className="metric">
            <span>Deadline</span>
            <strong>{recommendation.deadline}</strong>
            <em>{recommendation.deadlineStatus}</em>
          </article>
          <article className="metric">
            <span>Data mode</span>
            <strong>{recommendation.dataMode}</strong>
            <em>decision required</em>
          </article>
          <article className="metric">
            <span>Verification</span>
            <strong>{legality?.isValid ? "valid" : "not authored"}</strong>
            <em>{legality?.errors.length ?? 0} errors</em>
          </article>
        </section>

        <section className="grid">
          <article className="card">
            <h2>Evidence Requirement</h2>
            <p>
              Every authored squad, shortlist, XI, captaincy, bench, chip, risk,
              and change condition must cite evidence in `evidenceReferences`.
            </p>
          </article>
          <article className="card">
            <h2>Missing Decision</h2>
            <p>The configured squad and complete player reasoning are present. Formal publication remains incomplete.</p>
          </article>
        </section>

        {recommendation.decisionAnalysis?.playerDecisions.length ? (
          <section className="section">
            <h2>Configured squad reasoning</h2>
            <div className="grid reasoning-grid">
              {recommendation.decisionAnalysis.playerDecisions.map((decision) => (
                <article className="card reasoning-card" key={decision.playerId}>
                  <h3>{decision.playerName ?? `Player ${decision.playerId}`}</h3>
                  <p className="fine">{decision.role}</p>
                  <h4>Why selected</h4>
                  <ul className="list compact">
                    {decision.whyPicked.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                  <h4>Why not the alternative</h4>
                  <ul className="list compact">
                    {decision.comparedAgainst.map((alternative) => (
                      <li key={alternative.name}>{alternative.name}: {alternative.whyNot.join(" ")}</li>
                    ))}
                  </ul>
                  {decision.materialRisk ? <><h4>Material risk</h4><p>{decision.materialRisk}</p></> : null}
                  {decision.riskResponse ? <><h4>Risk response</h4><p>{decision.riskResponse}</p></> : null}
                  <h4>Evidence</h4>
                  <ul className="list compact evidence-list">
                    {decision.evidence.map((reference) => <li key={reference}><code>{reference}</code></li>)}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  const players = recommendation.squadBefore.players;
  const starters = playersByIds(players, recommendation.pickTeam.startingXI);
  const bench = playersByIds(players, recommendation.pickTeam.benchOrder);
  const squad = playersByPosition(players);

  return (
    <>
      <section className="hero">
        <div className="eyebrow">GW{recommendation.gameweek} recommendation</div>
        <h1>Recommendations</h1>
        <p>
          Read-only summary of the agent-authored squad, verification result,
          and evidence-only risk report. All FPL changes remain manual.
        </p>
      </section>

      <section className="metrics">
        <article className="metric">
          <span>Deadline</span>
          <strong>{recommendation.deadline}</strong>
          <em>{recommendation.deadlineStatus}</em>
        </article>
        <article className="metric">
          <span>Budget</span>
          <strong>£{budgetUsed(players).toFixed(1)}</strong>
          <em>£{recommendation.squadBefore.bank.toFixed(1)} bank</em>
        </article>
        <article className="metric">
          <span>Projected XI</span>
          <strong>{recommendation.pickTeam.projectedPoints.toFixed(1)}</strong>
          <em>{recommendation.pickTeam.formation}</em>
        </article>
        <article className="metric">
          <span>Verification</span>
          <strong>{legality?.isValid ? "valid" : "needs review"}</strong>
          <em>{legality?.errors.length ?? 0} errors</em>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Captaincy</h2>
          <p>
            Captain: {playerName(players, recommendation.captaincy.captainPlayerId)}
            <br />
            Vice: {playerName(players, recommendation.captaincy.viceCaptainPlayerId)}
          </p>
          <p className="fine">{recommendation.captaincy.explanation}</p>
        </article>

        <article className="card">
          <h2>Chip</h2>
          <p>{recommendation.chip.chip}</p>
          <ul className="list compact">
            {recommendation.chip.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Risk Summary</h2>
          {riskReport ? (
            <p>
              {riskReport.summary.high} high, {riskReport.summary.medium} medium, {riskReport.summary.low} low
              <br />
              {riskReport.summary.evidenceGaps} evidence gaps
            </p>
          ) : (
            <p>No risk report has been generated.</p>
          )}
        </article>

        <article className="card">
          <h2>Minutes</h2>
          {minutesRiskReport ? (
            <p>
              {minutesRiskReport.summary.secure} secure, {minutesRiskReport.summary.watch} watch
              <br />
              {minutesRiskReport.summary.starterWatchOrWorse} starter watch-or-worse
            </p>
          ) : (
            <p>No minutes report has been generated.</p>
          )}
        </article>
      </section>

      <section className="section">
        <h2>Fixture Horizons</h2>
        {fixtureHorizonReport ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>1GW A/D</th>
                  <th>3GW A/D</th>
                  <th>6GW A/D</th>
                  <th>Swing</th>
                </tr>
              </thead>
              <tbody>
                {fixtureHorizonReport.teams.map((team) => {
                  const summary = (gameweeks: 1 | 3 | 6) => {
                    const horizon = team.horizons.find((item) => item.gameweeks === gameweeks);
                    return horizon
                      ? `${horizon.attack.averageDifficulty ?? "n/a"}/${horizon.defence.averageDifficulty ?? "n/a"}`
                      : "n/a";
                  };
                  return (
                    <tr key={team.teamId}>
                      <td>{team.teamName}</td>
                      <td>{summary(1)}</td>
                      <td>{summary(3)}</td>
                      <td>{summary(6)}</td>
                      <td>{team.swing.attack}/{team.swing.defence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Fixture horizon evidence is unavailable. The legacy fixture ticker remains the fallback.</p>
        )}
      </section>

      <section className="section">
        <h2>Starting XI</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {starters.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.position}</td>
                  <td>£{player.price.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Bench</h2>
          <ol className="list compact">
            {bench.map((player) => (
              <li key={player.id}>
                {player.name} ({player.position}, £{player.price.toFixed(1)})
              </li>
            ))}
          </ol>
        </article>

        <article className="card">
          <h2>Squad Structure</h2>
          <div className="stack">
            {Object.entries(squad).map(([position, positionPlayers]) => (
              <p key={position}>
                <strong>{position}</strong>: {positionPlayers.map((player) => player.name).join(", ")}
              </p>
            ))}
          </div>
        </article>
      </section>

      {recommendation.decisionAnalysis ? (
        <section className="section">
          <h2>Pick Analysis</h2>
          <p>{recommendation.decisionAnalysis.summary}</p>
          <div className="grid">
            {recommendation.decisionAnalysis.playerDecisions.map((decision) => (
              <article className="card" key={decision.playerId}>
                <h3>{playerName(players, decision.playerId)}</h3>
                <p className="fine">{decision.role}</p>
                <h4>Why Picked</h4>
                <ul className="list compact">
                  {decision.whyPicked.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <h4>Why Not Alternatives</h4>
                <ul className="list compact">
                  {decision.comparedAgainst.map((alternative) => (
                    <li key={alternative.name}>
                      {alternative.name}: {alternative.whyNot.join(" ")}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {recommendation.decisionAnalysis ? (
        <section className="grid">
          <article className="card">
            <h2>Captaincy Comparison</h2>
            <ul className="list compact">
              {recommendation.decisionAnalysis.captaincy.whyCaptain.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <h3>Why Not Others</h3>
            <ul className="list compact">
              {recommendation.decisionAnalysis.captaincy.comparedAgainst.map((alternative) => (
                <li key={alternative.name}>
                  {alternative.name}: {alternative.whyNot.join(" ")}
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Key Omissions</h2>
            <ul className="list compact">
              {recommendation.decisionAnalysis.keyOmissions.map((omission) => (
                <li key={omission.name}>
                  {omission.name}: {omission.whyOmitted.join(" ")} Reconsider if:{" "}
                  {omission.wouldReconsiderIf.join(" ")}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      <section className="grid">
        <article className="card">
          <h2>Risks</h2>
          <ul className="list compact">
            {recommendation.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>What Changes It</h2>
          <ul className="list compact">
            {recommendation.whatWouldChangeMyMind.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </article>
      </section>

      {riskReport ? (
        <section className="grid">
          <article className="card">
            <h2>Player Risk</h2>
            <ul className="list compact">
              {riskReport.playerRisks.map((risk) => (
                <li key={`${risk.name}-${risk.position}`}>
                  {risk.name}: {risk.level} - {risk.reasons.join(" ")}
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Evidence Gaps</h2>
            <ul className="list compact">
              {riskReport.evidenceGaps.map((gap) => (
                <li key={gap.area}>
                  {gap.area}: {gap.status} - {gap.message}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {minutesRiskReport ? (
        <section className="section">
          <h2>Minutes Risk</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Role</th>
                  <th>Risk</th>
                  <th>Historical</th>
                  <th>Predicted XI</th>
                  <th>Minutes</th>
                </tr>
              </thead>
              <tbody>
                {minutesRiskReport.items.filter((item) => item.selected).map((item) => (
                  <tr key={item.playerId}>
                    <td>{item.webName}</td>
                    <td>{item.starting ? "starter" : `bench ${item.benchPosition ?? "n/a"}`}</td>
                    <td>{item.riskLevel}</td>
                    <td>{item.historicalConfidence}</td>
                    <td>{item.predictedLineupConfidence}</td>
                    <td>{item.minutes ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
