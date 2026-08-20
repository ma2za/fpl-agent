import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtifactSchemas,
  ArtifactValidationError,
  AgentDecisionArtifactSchema,
  CandidateArtifactSchema,
  ClubScenarioSetSchema,
  ConcentrationRiskReportSchema,
  EvidenceReportSchema,
  FixtureHorizonReportSchema,
  DraftDeltaReportSchema,
  OptimizationRequestSchema,
  ProjectionUncertaintyReportSchema,
  RecommendationArtifactSchema,
  RobustnessReportSchema,
  ScenarioComparisonSchema,
  SharedAssumptionGraphSchema,
  SquadCandidateSchema,
  StructureSimulationReportSchema,
  ToolEvidenceArtifactSchema,
  WeeklyStrategySchema,
  canonicalArtifactJson,
  canonicalizeArtifact,
  parseArtifactJson,
  readArtifactFile
} from "../src";
import { variantRecommendation } from "./fixtures/variantRecommendation";
import { EvidenceReadinessReportSchema } from "../../player-store/src";

const fixtureDir = path.join("packages", "agent", "tests", "fixtures", "legacy-artifacts");

describe("artifact schemas", () => {
  it("reads legacy fixtures without schemaVersion", async () => {
    const recommendation = await readArtifactFile(
      path.join(fixtureDir, "recommendation-template.json"),
      RecommendationArtifactSchema
    );
    const evidence = await readArtifactFile(
      path.join(fixtureDir, "evidence-report.json"),
      EvidenceReportSchema
    );
    const strategy = await readArtifactFile(
      path.join(fixtureDir, "weekly-strategy.json"),
      WeeklyStrategySchema
    );

    expect(recommendation.schemaVersion).toBeUndefined();
    expect(evidence.schemaVersion).toBeUndefined();
    expect(strategy.schemaVersion).toBeUndefined();
  });

  it("accepts schema version 1 and preserves additive keys", async () => {
    const fixture = JSON.parse(
      await readFile(path.join(fixtureDir, "evidence-report.json"), "utf8")
    );
    const parsed = EvidenceReportSchema.parse({
      ...fixture,
      schemaVersion: 1,
      additiveField: "preserved"
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.additiveField).toBe("preserved");
  });

  it("rejects unsupported schema versions", async () => {
    const fixture = JSON.parse(
      await readFile(path.join(fixtureDir, "weekly-strategy.json"), "utf8")
    );

    expect(() => WeeklyStrategySchema.parse({ ...fixture, schemaVersion: 2 })).toThrow();
  });

  it("separates tool, candidate, and agent decision artifacts", () => {
    const tool = {
      schemaVersion: 2,
      artifactKind: "tool_evidence",
      generatedAt: "2026-08-01T00:00:00.000Z",
      tool: "test-tool",
      payload: { players: [1, 2, 3] }
    } as const;
    const candidate = {
      schemaVersion: 2,
      artifactKind: "candidate",
      generatedAt: "2026-08-01T00:00:00.000Z",
      scenarioId: "test-scenario",
      payload: { playerIds: [1, 2, 3] }
    } as const;
    const decision = variantRecommendation();

    expect(ToolEvidenceArtifactSchema.parse(tool).artifactKind).toBe("tool_evidence");
    expect(CandidateArtifactSchema.parse(candidate).artifactKind).toBe("candidate");
    expect(AgentDecisionArtifactSchema.parse(decision).artifactKind).toBe("agent_decision");
    expect(AgentDecisionArtifactSchema.safeParse(tool).success).toBe(false);
    expect(AgentDecisionArtifactSchema.safeParse(candidate).success).toBe(false);
    expect(ToolEvidenceArtifactSchema.safeParse(decision).success).toBe(false);
    expect(CandidateArtifactSchema.safeParse(decision).success).toBe(false);
  });

  it("does not parse player-intelligence evidence as an agent decision", () => {
    const readiness = EvidenceReadinessReportSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-08-01T00:00:00.000Z",
      gameweek: 1,
      items: [],
      summary: { ready: 0, caution: 0, insufficient: 0, selectedInsufficient: 0 },
      warnings: []
    });

    expect(AgentDecisionArtifactSchema.safeParse(readiness).success).toBe(false);
  });

  it("keeps optimization requests and squad candidates separate from final decisions", () => {
    const request = {
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt: "2026-08-12T00:00:00.000Z",
      requestId: "gw1-structures",
      gameweek: 1,
      horizons: [1, 3, 6],
      scenarios: [{ id: "baseline", label: "Baseline", constraints: { budget: 100 } }],
      objective: "role-adjusted-squad-utility",
      modelAssumptions: ["Independent horizon inputs."]
    };
    const candidate = {
      schemaVersion: 1,
      artifactKind: "candidate",
      candidateId: "gw1-structures:baseline:gw1:1",
      requestId: "gw1-structures",
      scenarioId: "baseline",
      horizon: 1,
      playerIds: Array.from({ length: 15 }, (_, index) => index + 1),
      startingXI: Array.from({ length: 11 }, (_, index) => index + 1),
      benchOrder: [12, 13, 14, 15],
      formation: "3-4-3",
      cost: 100,
      metrics: {
        objective: 60,
        rawProjection: 65,
        roleAdjustedProjection: 58,
        downside: 40,
        benchValue: 2,
        roleConfidence: 0.8
      },
      constraints: { budget: 100 }
    };

    expect(OptimizationRequestSchema.parse(request).requestId).toBe("gw1-structures");
    expect(SquadCandidateSchema.parse(candidate).candidateId).toContain("baseline");
    expect(AgentDecisionArtifactSchema.safeParse(request).success).toBe(false);
    expect(AgentDecisionArtifactSchema.safeParse(candidate).success).toBe(false);
  });

  it("validates correlated-scenario artifacts as tool evidence", () => {
    const generatedAt = "2026-08-13T00:00:00.000Z";
    const graph = SharedAssumptionGraphSchema.parse({
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt,
      assumptions: [{ assumptionId: "asm:attack:1", kind: "team_attack", teamId: 1, label: "Attack" }],
      dependencies: [{ playerId: 1, assumptionId: "asm:attack:1", sensitivity: 2 }]
    });
    const scenarios = ClubScenarioSetSchema.parse({
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt,
      scenarioSetId: "club:1",
      teamId: 1,
      scenarios: [
        { level: "strong", probability: 0.25, shocks: [] },
        { level: "baseline", probability: 0.5, shocks: [] },
        { level: "weak", probability: 0.25, shocks: [] }
      ]
    });
    const report = ConcentrationRiskReportSchema.parse({
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt,
      model: "shared-assumption-scenarios",
      modelVersion: "0.0.15",
      concentrationPenaltyWeight: 0,
      candidates: [],
      assumptions: []
    });
    const comparison = ScenarioComparisonSchema.parse({
      schemaVersion: 1,
      artifactKind: "tool_evidence",
      generatedAt,
      candidateIds: [],
      metrics: [],
      decisionPolicy: "No selection."
    });

    expect(scenarios.scenarios).toHaveLength(3);
    for (const artifact of [graph, scenarios, report, comparison]) {
      expect(AgentDecisionArtifactSchema.safeParse(artifact).success).toBe(false);
    }
  });

  it("rejects malformed fixture horizon artifacts at the read boundary", () => {
    expect(() => parseArtifactJson(
      JSON.stringify({
        generatedAt: "2026-08-01T00:00:00.000Z",
        gameweek: 1,
        source: {},
        thresholds: {},
        teams: "invalid",
        exposures: [],
        warnings: []
      }),
      FixtureHorizonReportSchema,
      "fixture-horizon-report.json"
    )).toThrow(/fixture-horizon-report\.json[\s\S]*teams/);
  });

  it("exports every persisted artifact schema", () => {
    expect(Object.keys(ArtifactSchemas).sort()).toEqual([
      "adapterCoverageReport",
      "agentDecision",
      "candidate",
      "claimLedger",
      "clubScenarioSet",
      "concentrationRiskReport",
      "counterfactualComparison",
      "counterfactualSet",
      "currentRoleReport",
      "draftDeltaReport",
      "evidenceReport",
      "evidenceSnapshot",
      "fixtureHorizonReport",
      "fixtureTicker",
      "languageValidationReport",
      "legalityReport",
      "minutesRiskReport",
      "oddsReport",
      "optimizationProof",
      "optimizationRequest",
      "publicEvidenceReport",
      "publicationGate",
      "recommendation",
      "riskReport",
      "robustnessReport",
      "scenarioComparison",
      "setPieceReport",
      "sharedAssumptionGraph",
      "squadCandidate",
      "strategyEvidence",
      "structureSimulationReport",
      "teamNewsReport",
      "toolEvidence",
      "variantComparison",
      "weeklyStrategy"
    ]);
  });

  it("validates neutral structure simulation reports", () => {
    const report = {
      schemaVersion: 1,
      model: "shared-player-monte-carlo",
      modelVersion: "0.0.17",
      mode: "MAX_EXPECTED_POINTS",
      seed: 17,
      sampleCount: 1_000,
      results: [
        { candidateId: "a", expectedPoints: 60, p10: 45, p50: 60, p90: 75, expectedRankUtility: null, objectiveScore: 60 },
        { candidateId: "b", expectedPoints: 59, p10: 44, p50: 59, p90: 74, expectedRankUtility: null, objectiveScore: 59 }
      ],
      assumptions: ["Ownership is excluded from the objective."],
      decisionPolicy: "No candidate is selected."
    } as const;
    expect(StructureSimulationReportSchema.parse(report)).toEqual(report);
  });
});

describe("artifact IO", () => {
  it("reports malformed JSON with the file path", () => {
    expect(() => parseArtifactJson("{", EvidenceReportSchema, "broken.json")).toThrow(
      /Invalid artifact broken\.json/
    );
  });

  it("reports field-level validation issues", () => {
    expect(() =>
      parseArtifactJson(
        JSON.stringify({
          generatedAt: "now",
          gameweek: "one"
        }),
        EvidenceReportSchema,
        "evidence-report.json"
      )
    ).toThrow(/gameweek/);
  });

  it("uses a dedicated validation error", () => {
    expect(() => parseArtifactJson("null", EvidenceReportSchema)).toThrow(
      ArtifactValidationError
    );
  });

  it("validates normalized probabilistic projection artifacts", () => {
    const report = {
      schemaVersion: 1,
      generatedAt: "2026-08-09T00:00:00.000Z",
      gameweek: 1,
      model: "appearance-state-mixture",
      modelVersion: "0.0.12",
      seed: 12,
      sampleCount: 1000,
      items: [{
        playerId: 1,
        appearance: {
          playerId: 1,
          startProbability: 0.8,
          subAppearanceProbability: 0.1,
          noAppearanceProbability: 0.1,
          appearanceProbability: 0.9,
          historicalRoleConfidence: 0.8,
          currentRoleEvidenceConfidence: 0.7,
          availabilityConfidence: 1,
          overallEvidenceConfidence: 0.8,
          evidenceUncertainty: 0.2,
          source: "current_role",
          reasonCodes: ["current_role"]
        },
        minutes: {
          expectedMinutes: 70,
          median: 80,
          p10: 0,
          p90: 90,
          standardDeviation: 30,
          startMinutesMean: 84,
          substituteMinutesMean: 16,
          sampleSource: "cohort",
          cohort: "mid-established-starter"
        },
        rawProjectionIfStarting: 7,
        conditionalSubstitutePoints: 1,
        roleAdjustedProjection: 5.7,
        median: 5,
        p10: 0,
        p90: 12,
        projectionStandardDeviation: 4,
        footballOutcomeVariance: 16,
        evidenceUncertainty: 0.2,
        model: "appearance-state-mixture",
        modelVersion: "0.0.12",
        inputs: {
          seed: 1,
          sampleCount: 1000,
          availabilityFactor: 1,
          historicalExpectedMinutes: 85,
          historicalMinutes: 2800,
          position: "MID",
          price: 7,
          teamStrength: 4,
          fixtureDifficultyFactor: 1,
          roleSupportScore: 0.8,
          roleEvidenceConfidence: 0.7,
          roleCurrentEvidencePresent: true,
          roleDisagreement: false,
          conditionalSampleCount: 0,
          cohort: "mid-established-starter"
        }
      }],
      warnings: []
    };

    expect(ProjectionUncertaintyReportSchema.parse(report)).toEqual(report);
    expect(() => ProjectionUncertaintyReportSchema.parse({
      ...report,
      items: [{ ...report.items[0], appearance: { ...report.items[0].appearance, noAppearanceProbability: 0.2 } }]
    })).toThrow();
  });

  it("validates squad robustness and draft delta artifacts", () => {
    const report = {
      schemaVersion: 1,
      generatedAt: "2026-08-12T00:00:00.000Z",
      gameweek: 1,
      model: "independent-appearance-squad-utility",
      modelVersion: "0.0.13",
      seed: 13,
      sampleCount: 1000,
      thresholds: [40],
      utility: {
        rawStartingXIProjection: 60,
        roleAdjustedStartingXIProjection: 55,
        roleAdjustedWithAutosubs: 56,
        expectedStarters: 13,
        expectedAppearances: 14,
        unresolvedRoleCount: 2,
        p10: 42,
        median: 56,
        p90: 70,
        standardDeviation: 10,
        probabilityBelowThresholds: [{ threshold: 40, probability: 0.08 }]
      },
      substitutions: {
        benchCost: 18,
        expectedAutosubValue: 1,
        goalkeeper: {
          playerId: 2,
          cost: 4,
          appearanceProbability: 1,
          activationProbability: 0.05,
          marginalValue: 0.1
        },
        benchSlots: [1, 2, 3].map((slot) => ({
          slot,
          playerId: slot + 5,
          position: "DEF",
          cost: 4.5,
          appearanceProbability: 0.9,
          activationProbability: 0.2 / slot,
          marginalValue: 0.5 / slot,
          canReplacePositions: ["DEF"]
        }))
      },
      assumptions: ["Independent appearances."]
    };
    const delta = {
      schemaVersion: 1,
      generatedAt: report.generatedAt,
      previousLabel: "draft-1",
      currentLabel: "draft-2",
      deltas: {
        rawProjection: -1,
        roleAdjustedProjection: 1,
        expectedStarters: 0.2,
        autosubValue: 0.5,
        downsideP10: 2,
        benchCost: 0.5
      },
      supportedRobustnessMetrics: ["autosubValue", "downsideP10"]
    };

    expect(RobustnessReportSchema.parse(report)).toEqual(report);
    expect(DraftDeltaReportSchema.parse(delta)).toEqual(delta);
  });
});

describe("artifact canonicalization", () => {
  it("removes generated timestamps and sorts object keys", () => {
    const first = {
      z: 1,
      generatedAt: "first",
      nested: {
        b: 2,
        createdAt: "first",
        a: 1
      }
    };
    const second = {
      nested: {
        a: 1,
        createdAt: "second",
        b: 2
      },
      generatedAt: "second",
      z: 1
    };

    expect(canonicalArtifactJson(first)).toBe(canonicalArtifactJson(second));
    expect(canonicalizeArtifact(first)).toEqual({
      nested: {
        a: 1,
        b: 2
      },
      z: 1
    });
  });

  it("preserves array ordering", () => {
    expect(canonicalizeArtifact({ benchOrder: [2, 6, 12, 7] })).toEqual({
      benchOrder: [2, 6, 12, 7]
    });
  });
});
