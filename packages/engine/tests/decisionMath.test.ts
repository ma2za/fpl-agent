import { describe, expect, it } from "vitest";
import { analyzeDecisionMargins, applyProjectionAdjustments, applyProjectionScenarioAdjustment, simulateStructures } from "../src";

describe("decision mathematics", () => {
  it("quantifies model updates and rejects feature double counting", () => {
    const adjusted = applyProjectionAdjustments({
      baseProjection: 4.8,
      baseStandardDeviation: 2,
      baselineFeatureIds: ["fixture"],
      adjustments: [{
        featureId: "temporary-striker-role",
        sourceKind: "current_role",
        pointsDelta: 0.55,
        standardDeviation: 0.2,
        evidenceIds: ["obs:mbeumo-role"],
        translationModel: null
      }]
    });
    expect(adjusted.adjustedProjection).toBe(5.35);
    expect(adjusted.adjustedStandardDeviation).toBeGreaterThan(2);
    expect(() => applyProjectionAdjustments({
      baseProjection: 4.8,
      baseStandardDeviation: 2,
      baselineFeatureIds: ["temporary-striker-role"],
      adjustments: adjusted.adjustments
    })).toThrow("already included");
  });

  it("requires translation models for preseason and lower-league output", () => {
    expect(() => applyProjectionAdjustments({
      baseProjection: 3,
      baseStandardDeviation: 2,
      baselineFeatureIds: [],
      adjustments: [{
        featureId: "championship-attacking-output",
        sourceKind: "lower_league_output",
        pointsDelta: 0.2,
        standardDeviation: 0.4,
        evidenceIds: ["obs:championship"],
        translationModel: null
      }]
    })).toThrow("translation model");
  });

  it("derives transfer-risk mean and uncertainty from an evidenced scenario tree", () => {
    const adjusted = applyProjectionScenarioAdjustment({
      featureId: "transfer-availability",
      probabilityMethod: "EVIDENCE_CONDITIONED_AUTHORED_PRIOR",
      scenarios: [
        { scenarioId: "stays-starts", probability: 0.6, projectedPoints: 4, standardDeviation: 2, evidenceIds: ["obs:role"] },
        { scenarioId: "stays-benched", probability: 0.15, projectedPoints: 1.2, standardDeviation: 1, evidenceIds: ["obs:role"] },
        { scenarioId: "unavailable", probability: 0.25, projectedPoints: 0, standardDeviation: 0, evidenceIds: ["obs:transfer"] }
      ]
    });
    expect(adjusted.mean).toBe(2.58);
    expect(adjusted.standardDeviation).toBeGreaterThan(2);
    expect(adjusted.probabilityMethod).toBe("EVIDENCE_CONDITIONED_AUTHORED_PRIOR");
  });

  it("selects higher expected points without applying an ownership tax", () => {
    const report = simulateStructures({
      mode: "MAX_EXPECTED_POINTS",
      sampleCount: 20_000,
      candidates: [
        { candidateId: "haaland", playerIds: [1, 2], captainPlayerId: 1 },
        { candidateId: "no-haaland", playerIds: [2, 3], captainPlayerId: 3 }
      ],
      playerDistributions: [
        { playerId: 1, mean: 5, standardDeviation: 2 },
        { playerId: 2, mean: 4, standardDeviation: 1 },
        { playerId: 3, mean: 6, standardDeviation: 2 }
      ]
    });
    expect(report.results.find((item) => item.candidateId === "no-haaland")!.objectiveScore)
      .toBeGreaterThan(report.results.find((item) => item.candidateId === "haaland")!.objectiveScore);
    expect(report.assumptions).toContain("Ownership is excluded from the objective.");
  });

  it("requires a simulated field for rank objectives", () => {
    expect(() => simulateStructures({
      mode: "MAX_EXPECTED_RANK",
      candidates: [
        { candidateId: "a", playerIds: [1], captainPlayerId: null },
        { candidateId: "b", playerIds: [2], captainPlayerId: null }
      ],
      playerDistributions: [
        { playerId: 1, mean: 4, standardDeviation: 1 },
        { playerId: 2, mean: 5, standardDeviation: 1 }
      ]
    })).toThrow("requires simulated field candidates");
  });

  it("uses field weights through simulated rank outcomes without changing expected points", () => {
    const report = simulateStructures({
      mode: "MAX_EXPECTED_RANK",
      seed: 23,
      sampleCount: 5_000,
      candidates: [
        { candidateId: "safe", playerIds: [1], captainPlayerId: null },
        { candidateId: "volatile", playerIds: [2], captainPlayerId: null }
      ],
      fieldCandidates: [
        { candidateId: "field-common", playerIds: [1], captainPlayerId: null, weight: 0.8 },
        { candidateId: "field-other", playerIds: [3], captainPlayerId: null, weight: 0.2 }
      ],
      playerDistributions: [
        { playerId: 1, mean: 5, standardDeviation: 1 },
        { playerId: 2, mean: 5, standardDeviation: 4 },
        { playerId: 3, mean: 4, standardDeviation: 1 }
      ]
    });
    expect(report.results.every((item) => item.expectedRankUtility !== null)).toBe(true);
    expect(report.results[0].expectedPoints).toBeCloseTo(report.results[1].expectedPoints, 0);
    expect(report.assumptions.some((assumption) => assumption.includes("simulated competing scores"))).toBe(true);
  });

  it("simulates formation-safe autosubs and vice-captain fallback for complete squads", () => {
    const positions = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"] as const;
    const distributions = positions.map((position, index) => {
      const playerId = index + 1;
      const appearanceProbability = playerId === 13 ? 0 : 1;
      return { playerId, position, appearanceProbability, mean: appearanceProbability * 2, standardDeviation: 0, teamId: playerId, price: 5 };
    });
    const report = simulateStructures({
      mode: "MAX_EXPECTED_POINTS",
      seed: 17,
      sampleCount: 100,
      candidates: [
        {
          candidateId: "complete-a",
          playerIds: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
          benchOrder: [2, 6, 7, 12],
          captainPlayerId: 13,
          viceCaptainPlayerId: 14
        },
        {
          candidateId: "complete-b",
          playerIds: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
          benchOrder: [2, 6, 7, 12],
          captainPlayerId: 14,
          viceCaptainPlayerId: 13
        }
      ],
      playerDistributions: distributions
    });
    expect(report.results[0].expectedPoints).toBe(24);
    expect(report.results[1].expectedPoints).toBe(24);
    expect(report.results[0].expectedPointsBreakdown).toEqual({
      startingXI: 20,
      captainBonus: 0,
      expectedAutosubs: 2,
      viceCaptainFallback: 2,
      total: 24
    });
    expect(report.objectiveDefinition).toMatchObject({
      captainDoubling: true,
      viceCaptainFallback: true,
      automaticSubstitutions: true,
      formationLegalityAfterSubstitutions: true,
      goalkeeperSubstitution: true,
      appearanceProbabilities: true
    });
    expect(report.searchScope).toMatchObject({ generator: "manual", exhaustive: false, candidatesGenerated: 2 });
    expect(report.assumptions).toContain("Complete 15-player inputs apply formation-safe automatic substitutions and vice-captain fallback in every sample.");
  });

  it("shares clean-sheet states between defenders from the same team", () => {
    const report = simulateStructures({
      mode: "MAX_EXPECTED_POINTS",
      seed: 31,
      sampleCount: 20_000,
      candidates: [
        { candidateId: "double-defence", playerIds: [1, 2], captainPlayerId: null },
        { candidateId: "split-defence", playerIds: [3, 4], captainPlayerId: null }
      ],
      fixtureDistributions: [
        { fixtureId: 1, homeTeamId: 1, awayTeamId: 2, homeExpectedGoals: 1.5, awayExpectedGoals: 1, model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS", evidenceIds: ["odds:1"] },
        { fixtureId: 2, homeTeamId: 3, awayTeamId: 4, homeExpectedGoals: 1.5, awayExpectedGoals: 1, model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS", evidenceIds: ["odds:2"] },
        { fixtureId: 3, homeTeamId: 5, awayTeamId: 6, homeExpectedGoals: 1.5, awayExpectedGoals: 1, model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS", evidenceIds: ["odds:3"] }
      ],
      playerDistributions: [1, 2, 3, 4].map((playerId) => ({
        playerId,
        mean: 4,
        standardDeviation: 3,
        appearanceProbability: 1,
        position: "DEF" as const,
        teamId: playerId <= 2 ? 1 : playerId === 3 ? 3 : 5,
        fixtureId: playerId <= 2 ? 1 : playerId === 3 ? 2 : 3
      }))
    });
    const doubleDefence = report.results.find((item) => item.candidateId === "double-defence")!;
    const splitDefence = report.results.find((item) => item.candidateId === "split-defence")!;
    expect(doubleDefence.p90 - doubleDefence.p10).toBeGreaterThan(splitDefence.p90 - splitDefence.p10);
    expect(report.objectiveDefinition?.correlatedMatchStates).toBe(true);
  });

  it("reports the player mean that flips the winning decision", () => {
    const report = analyzeDecisionMargins({
      mode: "MAX_EXPECTED_POINTS",
      seed: 9,
      sampleCount: 100,
      perturbationStep: 0.1,
      candidates: [
        { candidateId: "winner", playerIds: [1], captainPlayerId: null },
        { candidateId: "rival", playerIds: [2], captainPlayerId: null }
      ],
      playerDistributions: [
        { playerId: 1, mean: 5, standardDeviation: 0 },
        { playerId: 2, mean: 4, standardDeviation: 0 }
      ],
      playerIds: [1, 2]
    });
    expect(report.baseObjectiveMargin).toBe(1);
    expect(report.margins).toEqual([
      expect.objectContaining({ playerId: 1, breakEvenMean: 4, margin: 1, pointsPerMeanPoint: 1 }),
      expect.objectContaining({ playerId: 2, breakEvenMean: 5, margin: 1, pointsPerMeanPoint: -1 })
    ]);
  });
});
