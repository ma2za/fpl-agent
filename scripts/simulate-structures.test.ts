import { describe, expect, it } from "vitest";
import { rejectCandidateTruncation, simulationCandidatesForHorizon } from "./simulate-structures";

describe("simulation frontier retention", () => {
  it("keeps every persisted candidate even when squads have identical players", () => {
    const candidates = simulationCandidatesForHorizon({
      candidates: [
        { candidateId: "scenario-a", horizon: 1, startingXI: [1, 2], benchOrder: [], metrics: { objective: 5 } },
        { candidateId: "scenario-b", horizon: 1, startingXI: [1, 2], benchOrder: [], metrics: { objective: 4 } },
        { candidateId: "other-horizon", horizon: 3, startingXI: [1, 2], benchOrder: [], metrics: { objective: 6 } }
      ]
    }, 1, [
      { playerId: 1, mean: 5 },
      { playerId: 2, mean: 4 }
    ]);

    expect(candidates.map((candidate) => candidate.candidateId)).toEqual(["scenario-a", "scenario-b"]);
  });

  it("rejects requests that ask to truncate the simulation frontier", () => {
    expect(() => rejectCandidateTruncation({ maximumCandidates: 100 })).toThrow("truncation is prohibited");
    expect(() => rejectCandidateTruncation({})).not.toThrow();
  });
});
