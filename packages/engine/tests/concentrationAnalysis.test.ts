import { describe, expect, it } from "vitest";
import {
  buildConcentrationAnalysis,
  type ClubScenarioSet,
  type ConcentrationPlayer,
  type SharedAssumptionGraph
} from "../src";

const generatedAt = "2026-08-13T00:00:00.000Z";
const graph: SharedAssumptionGraph = {
  schemaVersion: 1,
  artifactKind: "tool_evidence",
  generatedAt,
  assumptions: [
    { assumptionId: "asm:attack:1", kind: "team_attack", teamId: 1, label: "Team 1 attack" }
  ],
  dependencies: [
    { playerId: 1, assumptionId: "asm:attack:1", sensitivity: 2 },
    { playerId: 2, assumptionId: "asm:attack:1", sensitivity: 1.5 },
    { playerId: 3, assumptionId: "asm:attack:1", sensitivity: 1 }
  ]
};
const scenarioSet: ClubScenarioSet = {
  schemaVersion: 1,
  artifactKind: "tool_evidence",
  generatedAt,
  scenarioSetId: "club:1",
  teamId: 1,
  scenarios: [
    { level: "strong", probability: 0.25, shocks: [{ assumptionId: "asm:attack:1", value: 1 }] },
    { level: "baseline", probability: 0.5, shocks: [{ assumptionId: "asm:attack:1", value: 0 }] },
    { level: "weak", probability: 0.25, shocks: [{ assumptionId: "asm:attack:1", value: -1 }] }
  ]
};
const players: ConcentrationPlayer[] = [
  { playerId: 1, teamId: 1, baselineUtility: 6 },
  { playerId: 2, teamId: 1, baselineUtility: 5 },
  { playerId: 3, teamId: 1, baselineUtility: 4 },
  { playerId: 4, teamId: 2, baselineUtility: 4 }
];

describe("correlated concentration analysis", () => {
  const result = buildConcentrationAnalysis({
    generatedAt,
    graph,
    scenarioSets: [scenarioSet],
    players,
    candidates: [
      { candidateId: "maximum-two", playerIds: [1, 2, 4], independentP10: 9 },
      { candidateId: "triple", playerIds: [1, 2, 3], independentP10: 8 }
    ],
    concentrationPenaltyWeight: 0.5
  });

  it("applies one shared team shock to every dependent player", () => {
    const triple = result.report.candidates.find((candidate) => candidate.candidateId === "triple")!;
    const strong = triple.scenarioUtilities.find((scenario) => scenario.scenarioId.endsWith("1:strong"))!;
    const weak = triple.scenarioUtilities.find((scenario) => scenario.scenarioId.endsWith("1:weak"))!;

    expect(strong.utility).toBe(19.5);
    expect(weak.utility).toBe(10.5);
    expect(triple.pairwiseCovariances).toContainEqual({ playerAId: 1, playerBId: 2, covariance: 1.5 });
    expect(triple.squadVariance).toBe(10.125);
  });

  it("reports strong, baseline, and weak downside without treating players independently", () => {
    const triple = result.report.candidates.find((candidate) => candidate.candidateId === "triple")!;

    expect(triple.correlatedP10).toBe(10.5);
    expect(triple.downsideContributions).toEqual([
      { playerId: 1, worstScenarioLoss: 2 },
      { playerId: 2, worstScenarioLoss: 1.5 },
      { playerId: 3, worstScenarioLoss: 1 }
    ]);
    expect(triple.concentrationPenalty).toBeGreaterThan(0);
    expect(triple.penalizedObjective).toBeLessThan(triple.expectedUtility);
  });

  it("compares independently supplied maximum-two and triple candidates neutrally", () => {
    expect(result.comparison.metrics.map((item) => item.exposureClass)).toEqual(["maximum_two", "triple"]);
    expect(result.comparison.decisionPolicy).toContain("does not select, rank, or recommend");
    expect(result.comparison).not.toHaveProperty("winner");
    expect(result.comparison).not.toHaveProperty("selectedCandidateId");
  });
});
