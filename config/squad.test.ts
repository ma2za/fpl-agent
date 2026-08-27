import { describe, expect, it } from "vitest";
import playersJson from "../data/processed/players.json";
import decisionRecordJson from "../packages/content/recommendations/gw-1/decision-record.json";
import {
  generateSquadReasoning,
  validateSquadDecisionRecord,
  type SquadDecisionRecord
} from "../packages/agent/src/squadDecisionRecord";

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
