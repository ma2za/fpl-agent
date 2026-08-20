import { describe, expect, it } from "vitest";
import { evaluateRecommendationQuality, type WeeklyRecommendation } from "../src";

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2026-07-04T00:00:00.000Z",
  deadline: "2026-08-15T10:00:00Z",
  deadlineStatus: "open",
  dataMode: "official",
  optimizationPolicy: {
    mode: "MAX_EXPECTED_POINTS",
    horizon: "GW1",
    ownershipTreatment: "excluded",
    structureSimulationReportPath: "structure-simulation.json",
    rankSimulationReportPath: null,
    projectionAdjustments: []
  },
  squadBefore: {
    bank: 1,
    freeTransfers: 1,
    chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"],
    players: [
      { id: 1, name: "Goalkeeper 1", position: "GKP", teamId: 1, price: 4.5, nowCost: 45, status: "a" },
      { id: 2, name: "Goalkeeper 2", position: "GKP", teamId: 2, price: 4, nowCost: 40, status: "a" },
      { id: 3, name: "Defender 1", position: "DEF", teamId: 1, price: 5, nowCost: 50, status: "a" },
      { id: 4, name: "Defender 2", position: "DEF", teamId: 2, price: 5, nowCost: 50, status: "a" },
      { id: 5, name: "Defender 3", position: "DEF", teamId: 3, price: 4.5, nowCost: 45, status: "a" },
      { id: 6, name: "Defender 4", position: "DEF", teamId: 4, price: 4.5, nowCost: 45, status: "a" },
      { id: 7, name: "Defender 5", position: "DEF", teamId: 5, price: 4, nowCost: 40, status: "a" },
      { id: 8, name: "Midfielder 1", position: "MID", teamId: 3, price: 8, nowCost: 80, status: "a" },
      { id: 9, name: "Midfielder 2", position: "MID", teamId: 4, price: 8, nowCost: 80, status: "a" },
      { id: 10, name: "Midfielder 3", position: "MID", teamId: 5, price: 7, nowCost: 70, status: "a" },
      { id: 11, name: "Midfielder 4", position: "MID", teamId: 6, price: 6.5, nowCost: 65, status: "a" },
      { id: 12, name: "Midfielder 5", position: "MID", teamId: 7, price: 5.5, nowCost: 55, status: "a" },
      { id: 13, name: "Forward 1", position: "FWD", teamId: 6, price: 8, nowCost: 80, status: "a" },
      { id: 14, name: "Forward 2", position: "FWD", teamId: 7, price: 7, nowCost: 70, status: "a" },
      { id: 15, name: "Forward 3", position: "FWD", teamId: 8, price: 6.5, nowCost: 65, status: "a" }
    ]
  },
  recommendedAction: {
    type: "roll",
    transfers: [],
    transferCost: 0,
    bankAfter: 1,
    explanation: "Roll the transfer."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchOrder: [2, 6, 12, 7],
    projectedPoints: 60,
    explanation: "Fixture test pick. Projected points exclude captaincy."
  },
  captaincy: {
    captainPlayerId: 8,
    viceCaptainPlayerId: 13,
    alternatives: [],
    explanation: "Fixture test captaincy."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["No chip clears threshold."],
    warnings: []
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.7,
    label: "medium",
    explanation: "Fixture test confidence."
  },
  decisionAnalysis: {
    summary: "Test recommendation includes explicit player-pick comparisons.",
    squadStructure: [
      "Balanced 3-4-3 test structure.",
      "Keeps enough bank while covering every required position."
    ],
    structureComparisons: [
      {
        selectedStructure: "Balanced 3-4-3",
        rejectedStructure: "Premium-heavy 3-4-3",
        counterfactualCandidateIds: ["test:premium:gw1:1"],
        whySelected: ["Keeps the test squad legal with useful bank."],
        whyRejected: ["Would over-concentrate budget in one area for the fixture test."],
        evidence: ["test.md"]
      },
      {
        selectedStructure: "Balanced 3-4-3",
        rejectedStructure: "Bench-heavy 4-4-2",
        counterfactualCandidateIds: ["test:bench:gw1:1"],
        whySelected: ["Keeps more budget in the starting XI."],
        whyRejected: ["Would spend too much on substitutes for the fixture test."],
        evidence: ["test.md"]
      }
    ],
    playerDecisions: Array.from({ length: 15 }, (_, index) => ({
      playerId: index + 1,
      role: "squad",
      whyPicked: [
        `Player ${index + 1} projects 0.5 points above the compared option.`,
        `Player ${index + 1} has a 90% modeled start probability.`
      ],
      comparedAgainst: [
        {
          name: `Alternative ${index + 1}`,
          whyNot: [`Alternative ${index + 1} projects 0.5 points below the selected player.`]
        }
      ],
      evidence: ["test.md"]
    })),
    captaincy: {
      captainPlayerId: 8,
      whyCaptain: [
        "Midfielder 1 is the test captain.",
        "Midfielder 1 is in the starting XI."
      ],
      comparedAgainst: [
        {
          playerId: 13,
          name: "Forward 1",
          whyNot: ["Forward 1 is kept as vice-captain in the test recommendation."]
        }
      ],
      evidence: ["test.md"]
    },
    keyOmissions: [
      {
        name: "Omitted Player 1",
        whyOmitted: ["Omitted Player 1 is outside the test squad."],
        wouldReconsiderIf: ["The test structure changes."],
        evidence: ["test.md"]
      },
      {
        name: "Omitted Player 2",
        whyOmitted: ["Omitted Player 2 is outside the test squad."],
        wouldReconsiderIf: ["The test structure changes."],
        evidence: ["test.md"]
      }
    ]
  },
  evidenceReferences: [
    { area: "squad", source: "test", reportPath: "test.md", note: "Squad evidence." },
    { area: "structure", source: "test", reportPath: "test.md", note: "Structure evidence." },
    { area: "starting-xi", source: "test", reportPath: "test.md", note: "XI evidence." },
    { area: "shortlist", source: "test", reportPath: "test.md", note: "Shortlist evidence." },
    { area: "captaincy", source: "test", reportPath: "test.md", note: "Captaincy evidence." },
    { area: "bench", source: "test", reportPath: "test.md", note: "Bench evidence." },
    { area: "chip", source: "test", reportPath: "test.md", note: "Chip evidence." },
    { area: "risks", source: "test", reportPath: "test.md", note: "Risk evidence." },
    { area: "change-conditions", source: "test", reportPath: "test.md", note: "Change evidence." }
  ],
  risks: ["Fixture test risk."],
  whatWouldChangeMyMind: ["Fixture test condition."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

describe("evaluateRecommendationQuality", () => {
  it("passes a complete recommendation", () => {
    const result = evaluateRecommendationQuality(recommendation);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.gates.find((gate) => gate.gate === "budget")?.status).toBe("pass");
  });

  it("warns for excessive bank", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      squadBefore: {
        ...recommendation.squadBefore,
        bank: 8
      }
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Squad leaves £8.0 in the bank.");
  });

  it("rejects a triple-club rationale without concentration evidence", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      squadBefore: {
        ...recommendation.squadBefore,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 8 ? { ...player, teamId: 1 } : player
        )
      },
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        squadStructure: ["Fixtures justify triple exposure."]
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Triple-club exposure requires cited correlated scenario or concentration-risk evidence."
    );
  });

  it("fails when captaincy rationale is missing", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      captaincy: {
        ...recommendation.captaincy,
        explanation: ""
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Captaincy rationale is required.");
  });

  it("fails when chip rationale is missing", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      chip: {
        ...recommendation.chip,
        reasons: []
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Chip rationale is required.");
  });

  it("warns for provisional data", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      dataMode: "provisional"
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Recommendation uses provisional data.");
  });

  it("warns for low-minutes starters when metadata is available", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      squadBefore: {
        ...recommendation.squadBefore,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 8 ? { ...player, minutes: 500 } : player
        )
      }
    } as WeeklyRecommendation);

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Low historical minutes among starters: Midfielder 1.");
  });

  it("warns for maxed club exposure", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      squadBefore: {
        ...recommendation.squadBefore,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 7 ? { ...player, teamId: 1 } : player
        )
      }
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Team 1 uses all 3 slots.");
  });

  it("warns for overfunded benches", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      pickTeam: {
        ...recommendation.pickTeam,
        benchOrder: [2, 6, 12, 14]
      }
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Bench costs £21.0, which may overprotect substitutes at the expense of the XI.");
  });

  it("fails when projection scope does not say whether captaincy is included", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      pickTeam: {
        ...recommendation.pickTeam,
        explanation: "Fixture test pick."
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Pick-team explanation must state whether projected points include captaincy.");
  });

  it("warns when confidence is too high for missing evidence", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      confidence: {
        score: 0.72,
        label: "medium",
        explanation: "No matched odds and predicted-lineup evidence is not normalized."
      }
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Confidence score is too high for missing odds or unnormalized lineup evidence.");
  });

  it("fails when evidence references are missing", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      evidenceReferences: []
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Evidence reference is required for squad.");
  });

  it("fails when pick comparison analysis is missing", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: undefined
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Decision analysis is required for every recommendation.");
  });

  it("rejects generic player-pick justification", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        playerDecisions: recommendation.decisionAnalysis!.playerDecisions.map((decision, index) =>
          index === 0
            ? { ...decision, whyPicked: ["Fits the selected starting structure.", "Included in the current official Scout squad."] }
            : decision
        )
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Decision analysis for Goalkeeper 1 must use specific, evidence-bearing why-picked reasons instead of generic squad-fit claims."
    );
  });

  it("rejects catch-all alternative justification", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        playerDecisions: recommendation.decisionAnalysis!.playerDecisions.map((decision, index) =>
          index === 0
            ? {
                ...decision,
                comparedAgainst: [{
                  name: "Named Alternative",
                  whyNot: ["Lost the role, price, fixture or structural trade-off in the selected £100.0m build."]
                }]
              }
            : decision
        )
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Decision analysis for Goalkeeper 1 versus Named Alternative must state the specific deciding trade-off."
    );
  });

  it("rejects club-coverage selection reasoning", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        keyOmissions: recommendation.decisionAnalysis!.keyOmissions.map((omission, index) =>
          index === 0 ? { ...omission, whyOmitted: ["Other players provide Arsenal coverage."] } : omission
        )
      }
    });
    expect(result.errors).toContain('Player selection and omission rationale must not use "coverage" as a decision reason.');
  });

  it("rejects ownership reasoning under expected-points mode", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        structureComparisons: recommendation.decisionAnalysis!.structureComparisons.map((comparison, index) =>
          index === 0 ? { ...comparison, whySelected: ["Ownership provides rank protection."] } : comparison
        )
      }
    });
    expect(result.errors).toContain("Ownership reasoning requires a rank-aware objective and cited rank simulation.");
  });

  it("rejects an unquantified model override", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        playerDecisions: recommendation.decisionAnalysis!.playerDecisions.map((decision, index) =>
          index === 0 ? {
            ...decision,
            whyPicked: ["A current-role model override adds striker minutes.", "The fixture projection remains 4.5 points."]
          } : decision
        )
      }
    });
    expect(result.errors).toContain(
      "Decision analysis for Goalkeeper 1 claims a model override without a quantified projection adjustment."
    );
  });

  it("rejects untranslated lower-league projection adjustments", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      optimizationPolicy: {
        ...recommendation.optimizationPolicy!,
        projectionAdjustments: [{
          playerId: recommendation.squadBefore.players[0].id,
          baseProjection: 4,
          adjustedProjection: 4.3,
          features: [{
            featureId: "lower-league-output",
            sourceKind: "lower_league_output",
            pointsDelta: 0.3,
            standardDeviation: 0.4,
            evidenceIds: ["observation:lower-league-output"],
            translationModel: null
          }]
        }]
      }
    });
    expect(result.errors).toContain(
      `Projection adjustment for player ${recommendation.squadBefore.players[0].id} must be quantified, feature-unique, and evidence-backed.`
    );
  });

  it("fails when structure comparisons are missing", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        structureComparisons: []
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Decision analysis must compare at least two full-squad structures with why-selected, why-rejected, and evidence.");
  });

  it("requires optimized counterfactual IDs for material structural rejections", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        structureComparisons: recommendation.decisionAnalysis!.structureComparisons.map((comparison, index) => ({
          ...comparison,
          material: index === 0,
          counterfactualCandidateIds: index === 0 ? [] : undefined
        }))
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Material structural rejection "Premium-heavy 3-4-3" must cite at least one optimized counterfactual candidate ID.');
  });

  it("accepts optimized counterfactual citations for material structural rejections", () => {
    const result = evaluateRecommendationQuality({
      ...recommendation,
      decisionAnalysis: {
        ...recommendation.decisionAnalysis!,
        structureComparisons: recommendation.decisionAnalysis!.structureComparisons.map((comparison) => ({
          ...comparison,
          material: true,
          counterfactualCandidateIds: ["gw1-structures:premium:gw3:1"]
        }))
      }
    });

    expect(result.isValid).toBe(true);
  });
});
