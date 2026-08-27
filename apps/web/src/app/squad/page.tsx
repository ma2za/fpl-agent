import playersJson from "../../../../../data/processed/players.json";
import decisionRecordJson from "../../../../../packages/content/recommendations/gw-1/decision-record.json";
import postmortem from "../../../../../packages/content/postmortems/gw-1.json";
import { CURRENT_SQUAD } from "../../../../../config/squad";
import { generateSquadReasoning, type SquadDecisionRecord } from "../../../../../packages/agent/src/squadDecisionRecord";

type Player = {
  id: number;
  name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  price: number;
};

const players = playersJson as Player[];
const decisionRecord = decisionRecordJson as unknown as SquadDecisionRecord;
const squadReasoning = generateSquadReasoning(decisionRecord);
const playerById = new Map(players.map((player) => [player.id, player]));
const overrideByPlayerId = new Map(postmortem.managerOverrides.map((override) => [override.inPlayerId, override]));

function playerName(playerId: number) {
  return playerById.get(playerId)?.name ?? `Player ${playerId}`;
}

function EvidenceReference({ value }: { value: string }) {
  return value.startsWith("https://") ? (
    <a className="evidence-link" href={value} rel="noreferrer" target="_blank">{value}</a>
  ) : (
    <code>{value}</code>
  );
}

export default function SquadPage() {
  const bench = new Set(CURRENT_SQUAD.benchOrder);
  const orderedPlayerIds = [
    ...CURRENT_SQUAD.players.filter((playerId) => !bench.has(playerId)),
    ...CURRENT_SQUAD.benchOrder
  ];
  const cost = CURRENT_SQUAD.players.reduce((sum, playerId) => sum + (playerById.get(playerId)?.price ?? 0), 0);
  const reasoningCoverage = CURRENT_SQUAD.players.filter((playerId) => squadReasoning[playerId]).length;

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Submitted GW1 selection</div>
        <h1>Squad and reasoning</h1>
        <p>
          The submitted squad preserves the AI rationale and identifies the three manager overrides separately.
        </p>
      </section>

      <section className="metrics">
        <article className="metric">
          <span>Squad cost</span>
          <strong>£{cost.toFixed(1)}</strong>
          <em>£{CURRENT_SQUAD.bank.toFixed(1)} bank</em>
        </article>
        <article className="metric">
          <span>Formation</span>
          <strong>3-4-3</strong>
          <em>11 starters, 4 substitutes</em>
        </article>
        <article className="metric">
          <span>Captain</span>
          <strong>{playerName(CURRENT_SQUAD.captainPlayerId)}</strong>
          <em>Vice: {playerName(CURRENT_SQUAD.viceCaptainPlayerId)}</em>
        </article>
        <article className="metric">
          <span>Reasoning coverage</span>
          <strong>{reasoningCoverage}/15</strong>
          <em>{15 - reasoningCoverage} manager overrides</em>
        </article>
      </section>

      <section className="section">
        <h2>Player decisions</h2>
        <div className="grid reasoning-grid">
          {orderedPlayerIds.map((playerId) => {
            const player = playerById.get(playerId)!;
            const reasoning = squadReasoning[playerId];
            const override = overrideByPlayerId.get(playerId);
            const captain = playerId === CURRENT_SQUAD.captainPlayerId;
            const viceCaptain = playerId === CURRENT_SQUAD.viceCaptainPlayerId;
            return (
              <article className="card reasoning-card" key={playerId}>
                <div className="reasoning-title">
                  <div>
                    <h3>{player.name}</h3>
                    <p className="fine">
                      {bench.has(playerId) ? "Bench" : "Starter"} · {player.position} · £{player.price.toFixed(1)}
                    </p>
                  </div>
                  {captain ? <span className="status">Captain</span> : null}
                  {viceCaptain ? <span className="status">Vice</span> : null}
                </div>

                <h4>Why selected</h4>
                <ul className="list compact">
                  {(reasoning?.whySelected ?? [`Manager override: ${override?.outName ?? "AI selection"} replaced by ${player.name}.`])
                    .map((reason) => <li key={reason}>{reason}</li>)}
                </ul>

                <h4>Why not the alternative</h4>
                <ul className="list compact">
                  {(reasoning?.comparedAgainst ?? (override ? [{
                    playerId: override.outPlayerId,
                    reason: `Submitted instead of the frozen AI pick; the recorded GW1 points delta was ${override.pointsDelta >= 0 ? "+" : ""}${override.pointsDelta}.`
                  }] : [])).map((alternative) => (
                    <li key={alternative.playerId}>
                      <strong>{playerName(alternative.playerId)}</strong>: {alternative.reason}
                    </li>
                  ))}
                </ul>

                <h4>Material risk</h4>
                <p>{reasoning?.materialRisk ?? "No separate pre-deadline manager rationale was recorded for this override."}</p>

                <h4>Risk response</h4>
                <p>{reasoning?.riskResponse ?? "The override is retained as submitted history and remains separate from the frozen AI decision."}</p>

                <h4>Evidence</h4>
                <ul className="list compact evidence-list">
                  {(reasoning?.evidence ?? [postmortem.source]).map((reference) => (
                    <li key={reference}><EvidenceReference value={reference} /></li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
