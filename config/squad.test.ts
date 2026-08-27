import { describe, expect, it } from "vitest";
import playersJson from "../data/processed/players.json";
import decisionRecordJson from "../packages/content/recommendations/gw-1/decision-record.json";
import projectionsJson from "../packages/content/recommendations/gw-1/probabilistic-projections.json";
import {
  buildSquadDecisionRecord,
  generateSquadReasoning,
  validateSquadDecisionRecord,
  type SquadDecisionRecord
} from "../packages/agent/src/squadDecisionRecord";
import { CURRENT_SQUAD, PLAYER_DECISION_INPUTS, SQUAD_STRATEGY } from "./squad";

const players = playersJson as Parameters<typeof validateSquadDecisionRecord>[1];
const record = decisionRecordJson as unknown as SquadDecisionRecord;

describe("configured squad decision record", () => {
  it("passes legality, consistency, strategy, evidence, and tolerance validation", () => {
    expect(validateSquadDecisionRecord(record, players)).toEqual({ isValid: true, errors: [] });
  });

  it("generates complete reasoning for every selected player", () => {
    const reasoning = generateSquadReasoning(record);
    expect(Object.keys(reasoning)).toHaveLength(15);
    expect(Object.values(reasoning).every((item) => item.whySelected.length > 0)).toBe(true);
  });

  it("retains manager alternatives and scales tolerance to projection uncertainty", () => {
    const current = buildSquadDecisionRecord({
      gameweek: record.gameweek,
      generatedAt: record.generatedAt,
      squad: CURRENT_SQUAD,
      strategy: SQUAD_STRATEGY,
      players,
      projections: projectionsJson,
      decisions: PLAYER_DECISION_INPUTS,
      evidence: record.evidence
    });
    const mukiele = current.playerDecisions.find((decision) => decision.playerId === 533)!;
    const okafor = current.playerDecisions.find((decision) => decision.playerId === 336)!;

    expect(current.validation).toEqual({ isValid: true, errors: [] });
    expect(mukiele.alternatives!.map((alternative) => alternative.playerId)).toContain(418);
    expect(okafor.alternatives!.map((alternative) => alternative.playerId)).toContain(542);
    expect(current.playerDecisions.every((decision) =>
      decision.alternatives!.every((alternative) => alternative.uncertaintyThreshold! >= current.decisionTolerance.epsilon)
    )).toBe(true);

    current.playerDecisions[0].alternatives![0].uncertaintyThreshold! += 1;
    expect(validateSquadDecisionRecord(current, players).errors).toContain(
      `Uncertainty threshold is stale for player ${current.playerDecisions[0].playerId}.`
    );
  });

  it("rejects stale numerical comparisons", () => {
    const invalid = structuredClone(record);
    invalid.playerDecisions[0].alternative.delta += 1;
    expect(validateSquadDecisionRecord(invalid, players).errors).toContain(
      `Alternative delta is stale for player ${invalid.playerDecisions[0].playerId}.`
    );
  });

  it("rejects an invalid captain and stale executable trigger", () => {
    const invalid = structuredClone(record);
    invalid.squad.captainPlayerId = invalid.squad.benchOrder[0];
    invalid.playerDecisions.find((item) => item.playerId === 8)!.trigger!.threshold = 0.7;
    const result = validateSquadDecisionRecord(invalid, players);
    expect(result.errors).toContain("Captain must belong to the starting XI.");
    expect(result.errors).toContain("Risk trigger threshold is stale for player 8.");
  });
});
