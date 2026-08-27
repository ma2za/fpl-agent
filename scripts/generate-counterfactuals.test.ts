import { describe, expect, it } from "vitest";
import type { FixtureHorizonReport } from "../packages/agent/src";
import type { OptimizationRequest, PlayerForEngine, ProbabilisticProjection } from "../packages/engine/src";
import { optimizationPlayers } from "./generate-counterfactuals";

describe("counterfactual input construction", () => {
  it("applies scenario-mixture means before deterministic frontier search", () => {
    const player = { id: 55, teamId: 2, position: "FWD" } as PlayerForEngine;
    const projection = {
      playerId: 55,
      rawProjectionIfStarting: 5,
      roleAdjustedProjection: 4,
      p10: 1,
      appearance: { startProbability: 0.8, appearanceProbability: 0.9, overallEvidenceConfidence: 0.8 }
    } as ProbabilisticProjection;
    const request = {
      projectionScenarioAdjustments: [{
        playerId: 55,
        featureId: "transfer-state",
        probabilityMethod: "EVIDENCE_CONDITIONED_AUTHORED_PRIOR",
        scenarios: [
          { scenarioId: "available", probability: 0.6, projectedPoints: 5, standardDeviation: 2, evidenceIds: ["news:1"] },
          { scenarioId: "unavailable", probability: 0.4, projectedPoints: 0, standardDeviation: 0, evidenceIds: ["news:2"] }
        ]
      }]
    } as OptimizationRequest;

    const [result] = optimizationPlayers([player], [projection], { teams: [] } as unknown as FixtureHorizonReport, request);

    expect(result.horizons[1].roleAdjustedProjection).toBe(3);
    expect(result.horizons[1].benchValue).toBeCloseTo(0.3);
    expect(result.horizons[1].downside).toBeLessThan(1);
  });
});
