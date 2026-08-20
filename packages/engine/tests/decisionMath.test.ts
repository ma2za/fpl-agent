import { describe, expect, it } from "vitest";
import { applyProjectionAdjustments, simulateStructures } from "../src";

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
    expect(report.assumptions[2]).toContain("simulated competing scores");
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
    expect(report.assumptions).toContain("Complete 15-player inputs apply formation-safe automatic substitutions and vice-captain fallback in every sample.");
  });
});
