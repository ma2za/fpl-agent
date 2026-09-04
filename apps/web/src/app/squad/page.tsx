import playersJson from "../../../../../data/processed/players.json";
import decisionRecord from "../../../../../packages/content/recommendations/gw-2/decision-record.json";
import postmortem from "../../../../../packages/content/postmortems/gw-2.json";
import { CURRENT_SQUAD } from "../../../../../config/squad";

type Player = {
  id: number;
  name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  price: number;
};

const players = playersJson as Player[];
const playerById = new Map(players.map((player) => [player.id, player]));
const overrideByPlayerId = new Map(postmortem.managerOverrides.map((override) => [override.inPlayerId, override]));
const replacedByPlayerId = new Map(postmortem.managerOverrides.map((override) => [override.outPlayerId, override]));

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

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Submitted GW{CURRENT_SQUAD.sourceGameweek} selection</div>
        <h1>Squad and reasoning</h1>
        <p>
          The submitted squad preserves the frozen AI decision and identifies the manager's formation override separately.
        </p>
      </section>

      <section className="metrics">
        <article className="metric">
          <span>Squad value</span>
          <strong>£{postmortem.manager.teamValue.toFixed(1)}</strong>
          <em>£{CURRENT_SQUAD.bank.toFixed(1)} bank</em>
        </article>
        <article className="metric">
          <span>Formation</span>
          <strong>{CURRENT_SQUAD.formation}</strong>
          <em>11 starters, 4 substitutes</em>
        </article>
        <article className="metric">
          <span>Captain</span>
          <strong>{playerName(CURRENT_SQUAD.captainPlayerId)}</strong>
          <em>Vice: {playerName(CURRENT_SQUAD.viceCaptainPlayerId)}</em>
        </article>
        <article className="metric">
          <span>Simulation</span>
          <strong>{decisionRecord.simulation.sampleCount.toLocaleString("en-GB")}</strong>
          <em>{decisionRecord.simulation.candidatesSimulated.toLocaleString("en-GB")} candidates</em>
        </article>
      </section>

      <section className="section">
        <h2>Player decisions</h2>
        <div className="grid reasoning-grid">
          {orderedPlayerIds.map((playerId) => {
            const player = playerById.get(playerId)!;
            const override = overrideByPlayerId.get(playerId);
            const replaced = replacedByPlayerId.get(playerId);
            const captain = playerId === CURRENT_SQUAD.captainPlayerId;
            const viceCaptain = playerId === CURRENT_SQUAD.viceCaptainPlayerId;
            const transferredIn = playerId === decisionRecord.action.buyPlayerId;
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

                <h4>Recorded decision</h4>
                <p>
                  {override
                    ? `Manager started ${player.name} instead of ${override.outName}; the realized change was +${override.pointsDelta} point.`
                    : replaced
                      ? `The AI started ${player.name}, but the submitted formation benched him for ${replaced.inName}.`
                      : transferredIn
                        ? `Transferred in for ${decisionRecord.action.sellPlayerName} by the selected frontier candidate.`
                        : "Retained in the selected pre-deadline squad."}
                </p>

                <h4>Outcome</h4>
                <p>
                  {override?.outcomeNote ?? replaced?.outcomeNote ??
                    `${player.name} scored ${postmortem.submittedSelection.picks.find((pick) => pick.playerId === playerId)?.rawPoints ?? 0} points in GW${postmortem.gameweek}.`}
                </p>

                <h4>Evidence</h4>
                <ul className="list compact evidence-list">
                  {["packages/content/recommendations/gw-2/decision-record.json", postmortem.source].map((reference) => (
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
