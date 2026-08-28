import { describe, expect, it } from "vitest";
import {
  buildDraftDeltaReport,
  buildRobustnessReport,
  validateRobustnessClaim,
  type PlayerForEngine,
  type ProbabilisticProjection
} from "../src";

const positions = [
  "GKP", "GKP",
  "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD"
] as const;

function squad() {
  return positions.map((position, index) => ({
    id: index + 1,
    name: `Player ${index + 1}`,
    position,
    teamId: index + 1,
    price: position === "GKP" ? 4.5 : 5,
    nowCost: position === "GKP" ? 4.5 : 5,
    status: "a"
  })) as PlayerForEngine[];
}

function projection(playerId: number, appearanceProbability = 1, conditionalPoints = 2): ProbabilisticProjection {
  return {
    playerId,
    appearance: {
      playerId,
      startProbability: appearanceProbability,
      subAppearanceProbability: 0,
      noAppearanceProbability: 1 - appearanceProbability,
      appearanceProbability,
      historicalRoleConfidence: 0.8,
      currentRoleEvidenceConfidence: 0.8,
      availabilityConfidence: 1,
      overallEvidenceConfidence: 0.85,
      evidenceUncertainty: 0.15,
      source: "current_role",
      reasonCodes: ["current_role"]
    },
    minutes: {
      expectedMinutes: 90 * appearanceProbability,
      median: 90,
      p10: 0,
      p90: 90,
      standardDeviation: 0,
      startMinutesMean: 90,
      substituteMinutesMean: 0,
      sampleSource: "cohort",
      cohort: "test"
    },
    rawProjectionIfStarting: conditionalPoints,
    conditionalSubstitutePoints: 0,
    roleAdjustedProjection: appearanceProbability * conditionalPoints,
    median: conditionalPoints,
    p10: 0,
    p90: conditionalPoints,
    projectionStandardDeviation: Math.sqrt(appearanceProbability * (1 - appearanceProbability) * conditionalPoints ** 2),
    footballOutcomeVariance: appearanceProbability * (1 - appearanceProbability) * conditionalPoints ** 2,
    evidenceUncertainty: 0.15,
    model: "appearance-state-mixture",
    modelVersion: "0.0.13",
    inputs: {
      seed: playerId,
      sampleCount: 1000,
      availabilityFactor: 1,
      historicalExpectedMinutes: 90,
      historicalMinutes: 2000,
      position: positions[playerId - 1],
      price: 5,
      teamStrength: 4,
      fixtureDifficultyFactor: 1,
      roleSupportScore: 1,
      roleEvidenceConfidence: 0.8,
      roleCurrentEvidencePresent: true,
      roleDisagreement: false,
      conditionalSampleCount: 0,
      cohort: "test"
    }
  };
}

const startingXI = [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15];

function report(overrides: Record<number, [number, number]> = {}, benchOrder = [2, 6, 7, 12]) {
  return buildRobustnessReport({
    generatedAt: "2026-08-12T00:00:00.000Z",
    gameweek: 1,
    players: squad(),
    projections: positions.map((_, index) => {
      const [probability, points] = overrides[index + 1] ?? [1, 2];
      return projection(index + 1, probability, points);
    }),
    startingXI,
    benchOrder,
    thresholds: [20, 30],
    seed: 13,
    sampleCount: 500
  });
}

describe("squad utility", () => {
  it("matches simultaneous nonappearances and conditional bench depth", () => {
    const result = report({ 3: [0.5, 2], 4: [0.5, 2], 6: [1, 2], 7: [1, 1] });

    expect(result.substitutions.expectedAutosubValue).toBe(1.75);
    expect(result.substitutions.benchSlots[0]).toMatchObject({ playerId: 6, activationProbability: 0.75, marginalValue: 1.5 });
    expect(result.substitutions.benchSlots[1]).toMatchObject({ playerId: 7, activationProbability: 0.25, marginalValue: 0.25 });
    expect(result.substitutions.benchSlots[2]).toMatchObject({ playerId: 12, activationProbability: 0, marginalValue: 0 });
  });

  it("restores a legal formation before using an earlier incompatible substitute", () => {
    const result = report({ 3: [0, 2] }, [2, 12, 6, 7]);

    expect(result.substitutions.benchSlots[0]).toMatchObject({ playerId: 12, marginalValue: 0 });
    expect(result.substitutions.benchSlots[1]).toMatchObject({ playerId: 6, marginalValue: 2 });
    expect(result.substitutions.benchSlots[1].canReplacePositions).toEqual(["DEF"]);
  });

  it("is deterministic and discloses the independent-appearance assumption", () => {
    const first = report({ 3: [0.7, 4], 12: [0.8, 3] });
    const second = report({ 3: [0.7, 4], 12: [0.8, 3] });

    expect(second).toEqual(first);
    expect(first.assumptions.join(" ")).toContain("independent");
    expect(first.utility.probabilityBelowThresholds).toHaveLength(2);
  });

  it("reports draft deltas and rejects unsupported robustness prose", () => {
    const previous = report({ 3: [0.5, 2], 6: [1, 1] });
    const current = report({ 3: [0.5, 2], 6: [1, 3] });
    const delta = buildDraftDeltaReport({
      generatedAt: "2026-08-12T00:00:00.000Z",
      previousLabel: "draft-1",
      currentLabel: "draft-2",
      previous,
      current
    });

    expect(delta.deltas.autosubValue).toBeGreaterThan(0);
    expect(() => validateRobustnessClaim("Draft 2 is more robust.", delta, [])).toThrow(/cited metric/);
    expect(() => validateRobustnessClaim("Draft 2 is more robust.", delta, ["autosubValue"])).not.toThrow();
  });
});
