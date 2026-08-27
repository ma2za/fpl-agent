import playersJson from "../../../../../data/processed/players.json";
import decisionRecordJson from "../../../../../packages/content/recommendations/gw-1/decision-record.json";
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

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Canonical GW1 selection</div>
        <h1>Squad and reasoning</h1>
        <p>
          Every selected player carries the complete authored case: why selected,
          the rejected alternative, material risk, risk response and evidence.
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
          <strong>{decisionRecord.playerDecisions.length}/15</strong>
          <em>{decisionRecord.validation.isValid ? "validated" : "invalid"}</em>
        </article>
      </section>

      <section className="section">
        <h2>Player decisions</h2>
        <div className="grid reasoning-grid">
          {orderedPlayerIds.map((playerId) => {
            const player = playerById.get(playerId)!;
            const reasoning = squadReasoning[playerId];
            const captain = playerId === CURRENT_SQUAD.captainPlayerId;
            const viceCaptain = playerId === CURRENT_SQUAD.viceCaptainPlayerId;
            return (
              <article className="card reasoning-card" key={playerId}>
                <div className="reasoning-title">
                  <div>
                    <h3>{player.name}</h3>
                    <p className="fine">
                      {reasoning.role} · {player.position} · £{player.price.toFixed(1)}
                    </p>
                  </div>
                  {captain ? <span className="status">Captain</span> : null}
                  {viceCaptain ? <span className="status">Vice</span> : null}
                </div>

                <h4>Why selected</h4>
                <ul className="list compact">
                  {reasoning.whySelected.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>

                <h4>Why not the alternative</h4>
                <ul className="list compact">
                  {reasoning.comparedAgainst.map((alternative) => (
                    <li key={alternative.playerId}>
                      <strong>{playerName(alternative.playerId)}</strong>: {alternative.reason}
                    </li>
                  ))}
                </ul>

                <h4>Material risk</h4>
                <p>{reasoning.materialRisk}</p>

                <h4>Risk response</h4>
                <p>{reasoning.riskResponse}</p>

                <h4>Evidence</h4>
                <ul className="list compact evidence-list">
                  {reasoning.evidence.map((reference) => (
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
