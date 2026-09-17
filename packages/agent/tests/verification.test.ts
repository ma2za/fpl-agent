import { describe, expect, it } from "vitest";
import { startingXiCandidateId, verifyRecommendation, type WeeklyRecommendation } from "../src";
import { publicNewsArticlesFor, rankedTransferOptions, testClaimLedger, withDecisionConsistency } from "./fixtures/variantRecommendation";

const recommendation: WeeklyRecommendation = {
  schemaVersion: 2,
  artifactKind: "agent_decision",
  authorship: {
    kind: "coding_agent",
    agent: "test-agent",
    authoredAt: "2026-07-04T00:00:00.000Z"
  },
  decisionContext: {
    phase: "TRANSFER_WINDOW",
    deadlineProximity: "early",
    activeGameweek: 1,
    nextDeadline: "2026-08-15T10:00:00Z"
  },
  claimLedger: testClaimLedger(),
  decisionIds: testClaimLedger().decisions.map((decision) => decision.id),
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
    candidateSearch: { generator: "manual", exhaustive: false, playerUniverseSize: 100, candidatesGenerated: 6, candidatesSimulated: 6, discardedCandidates: 0 },
    projectionAdjustments: [],
    projectionScenarioAdjustments: []
  },
  squadBefore: {
    bank: 11.5,
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
    bankAfter: 11.5,
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
  topTransferCandidates: rankedTransferOptions(12),
  confidence: {
    score: 0.7,
    label: "medium",
    explanation: "Fixture test confidence."
  },
  decisionAnalysis: {
    summary: "Among the 6 evaluated candidates, this recommendation has the strongest objective score and explicit player-pick comparisons.",
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
  publicNewsArticles: [],
  risks: [],
  whatWouldChangeMyMind: [],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

recommendation.publicNewsArticles = publicNewsArticlesFor(recommendation.squadBefore.players, recommendation.createdAt);
withDecisionConsistency(recommendation);

describe("verifyRecommendation", () => {
  it("passes a legal recommendation", () => {
    const result = verifyRecommendation(recommendation);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.quality.gates.length).toBeGreaterThan(0);
  });

  it("rejects objective and horizon drift from the canonical policy", () => {
    const drifted = structuredClone(recommendation);
    const structure = drifted.decisionEvaluations!.find((item) => item.decisionType === "structure")!;
    structure.objectiveId = "different-objective";
    structure.horizon = "GW1-3";

    const result = verifyRecommendation(drifted);

    expect(result.errors).toContain("Decision dec:structure objective must match the canonical decision policy.");
    expect(result.errors).toContain("Decision dec:structure horizon must match the canonical decision policy.");
  });

  it("rejects multi-gameweek selection claims under a one-gameweek policy", () => {
    const overstated = structuredClone(recommendation);
    overstated.recommendedAction.explanation = "This player leads the three-week shortlist.";

    expect(verifyRecommendation(overstated).errors).toContain(
      "Recommendation claims multi-gameweek selection logic but the canonical decision policy horizon is GW1."
    );
  });

  it("requires five ranked transfer choices plus the roll baseline", () => {
    const incomplete = structuredClone(recommendation);
    incomplete.topTransferCandidates = incomplete.topTransferCandidates.slice(0, 4);
    expect(verifyRecommendation(incomplete).errors).toContain(
      "Transfer-window recommendations must publish five ranked transfer options plus one roll baseline."
    );

    const misranked = structuredClone(recommendation);
    [misranked.topTransferCandidates[0], misranked.topTransferCandidates[1]] =
      [misranked.topTransferCandidates[1]!, misranked.topTransferCandidates[0]!];
    expect(verifyRecommendation(misranked).errors).toContain(
      "The five transfer options must be ranked by expected gain over the canonical decision horizon."
    );

    const unevaluated = structuredClone(recommendation);
    unevaluated.topTransferCandidates[0]!.moves[0]!.buyPlayerId = 999;
    expect(verifyRecommendation(unevaluated).errors).toContain(
      "Every published transfer option must appear in the canonical transfer evaluation."
    );

    const illegal = structuredClone(recommendation);
    illegal.topTransferCandidates[0]!.isLegal = false;
    expect(verifyRecommendation(illegal).errors).toContain("Published transfer options must all be legal.");

    const duplicated = structuredClone(recommendation);
    duplicated.topTransferCandidates[1]!.id = duplicated.topTransferCandidates[0]!.id;
    expect(verifyRecommendation(duplicated).errors).toContain("Published transfer options must have unique candidate IDs.");

    const missingSelection = structuredClone(recommendation);
    missingSelection.recommendedAction.type = "transfer";
    missingSelection.recommendedAction.transfers = [{ sellPlayerId: 12, buyPlayerId: 999 }];
    expect(verifyRecommendation(missingSelection).errors).toContain(
      "The recommended action must appear in the published transfer options."
    );
  });

  it("blocks unavailable canonical transfer horizons while warning on legacy optionality", () => {
    const legacyResult = verifyRecommendation(recommendation);
    expect(legacyResult.warnings).toContain(
      "Transfer options without 0.0.26 planning metadata remain readable but do not expose option value, liquidity, downside, or reachable next-gameweek squads."
    );

    const unknown = structuredClone(recommendation);
    unknown.decisionPolicy!.horizon = "GW1-5";
    for (const candidate of unknown.topTransferCandidates) candidate.expectedGain5GW = null;
    expect(verifyRecommendation(unknown).errors).toContain(
      "The canonical transfer ranking horizon GW1-5 has unavailable option values."
    );
  });

  it("ranks 0.0.26 options by horizon value, transfer cost, and option value", () => {
    const planned = structuredClone(recommendation);
    for (const candidate of planned.topTransferCandidates) {
      candidate.planning = {
        modelVersion: "0.0.26",
        rankingHorizon: "GW1",
        immediateGain: candidate.expectedGain1GW,
        multiGameweekGain: candidate.expectedGain3GW,
        rankingGain: candidate.expectedGain1GW,
        optionValue: candidate.type === "roll" ? 0 : -0.5,
        replacementLiquidity: 3,
        downside: null,
        decisionValue: candidate.expectedGain1GW + (candidate.type === "roll" ? 0 : -0.5),
        nextGameweek: { freeTransfers: 1, bank: 1, reachableSquads: 4 },
        financials: {
          bankBefore: 1,
          saleProceeds: 0,
          purchaseCost: 0,
          bankAfter: 1,
          sellingPriceBasis: candidate.type === "roll" ? "not_applicable" : "current_price_fallback"
        },
        optionValueAssumption: {
          modelVersion: "0.0.26",
          pointsPerAdditionalFreeTransfer: 0.5,
          statement: "Test assumption."
        },
        assumptions: ["Test assumption."]
      };
    }
    planned.topTransferCandidates[0]!.planning!.decisionValue = -5;

    expect(verifyRecommendation(planned).errors).toContain(
      "The five transfer options must be ranked by expected gain over the canonical decision horizon."
    );
  });

  it("defaults a transfer-versus-roll near-tie to rolling", () => {
    const transferDecision = structuredClone(recommendation);
    const evaluation = transferDecision.decisionEvaluations!.find((item) => item.decisionType === "transfers")!;
    const roll = evaluation.candidateScores.find((candidate) => candidate.candidateId === "action:roll:none")!;
    const transfer = evaluation.candidateScores.find((candidate) => candidate.candidateId.startsWith("action:transfer:"))!;
    Object.assign(transfer, { rawExpectedPoints: 0.1, objectiveScore: 0.1, lowerBound: -0.9, upperBound: 1.1 });
    transferDecision.topTransferCandidates[0]!.expectedGain1GW = 0.1;
    evaluation.selectedCandidateId = transfer.candidateId;
    evaluation.objectiveLeaderCandidateId = transfer.candidateId;
    evaluation.comparisonStatus = "NEAR_TIE";
    evaluation.nearTieCandidateIds = [transfer.candidateId, roll.candidateId];

    expect(verifyRecommendation(transferDecision).errors).toContain(
      "Decision dec:transfers must roll when a transfer is tied with the roll baseline unless a quantified override is recorded."
    );
  });

  it("accepts the roll policy default inside a transfer near-tie", () => {
    const rollDecision = structuredClone(recommendation);
    const evaluation = rollDecision.decisionEvaluations!.find((item) => item.decisionType === "transfers")!;
    const roll = evaluation.candidateScores.find((candidate) => candidate.candidateId === "action:roll:none")!;
    const transfer = evaluation.candidateScores.find((candidate) => candidate.candidateId.startsWith("action:transfer:"))!;
    Object.assign(transfer, { rawExpectedPoints: 0.1, objectiveScore: 0.1, lowerBound: -0.9, upperBound: 1.1 });
    rollDecision.topTransferCandidates[0]!.expectedGain1GW = 0.1;
    evaluation.selectedBy = "policy_default";
    evaluation.objectiveLeaderCandidateId = transfer.candidateId;
    evaluation.comparisonStatus = "NEAR_TIE";
    evaluation.nearTieCandidateIds = [transfer.candidateId, roll.candidateId];

    expect(verifyRecommendation(rollDecision).errors).toEqual([]);
  });

  it("requires the unconstrained leader and objective cost for manager preference exclusions", () => {
    const constrained = structuredClone(recommendation);
    const evaluation = constrained.decisionEvaluations!.find((item) => item.decisionType === "transfers")!;
    evaluation.candidateScores.push({
      candidateId: "action:transfer:12>68",
      rawExpectedPoints: 0.3,
      objectiveScore: 0.3,
      eligible: false,
      eligibilityKind: "preference_excluded",
      preferenceConstraintIds: ["manager:no-bournemouth"],
      ineligibilityReasons: ["Manager excluded Bournemouth targets."],
      lowerBound: null,
      upperBound: null
    });

    expect(verifyRecommendation(constrained).errors).toContain(
      "Decision dec:transfers selects a preference-constrained objective leader without declaring the constrained scope."
    );

    evaluation.selectionScope = "preference_constrained";
    evaluation.unconstrainedObjectiveLeaderCandidateId = "action:transfer:12>68";
    evaluation.preferenceTradeoff = { objectiveScoreDelta: 0.3, constraintIds: ["manager:no-bournemouth"] };
    expect(verifyRecommendation(constrained).errors).toEqual([]);
  });

  it("rejects clear-winner language for a numerical near-tie", () => {
    const overstated = structuredClone(recommendation);
    const captaincy = overstated.decisionEvaluations!.find((item) => item.decisionType === "captaincy")!;
    captaincy.uncertainty = "The selected captain is clearly better than the tied alternative.";

    expect(verifyRecommendation(overstated).errors).toContain(
      "Decision dec:captaincy uses clear-winner language for a material near-tie."
    );
  });

  it("blocks incomplete selected-player research coverage", () => {
    const result = verifyRecommendation(recommendation, {
      selectedPlayerEvidence: recommendation.squadBefore.players.map((player) => ({
        playerId: player.id,
        status: player.id === 1 ? "INSUFFICIENT" : "READY",
        reasonCodes: player.id === 1 ? ["incomplete_research_coverage"] : []
      }))
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Goalkeeper 1 lacks completed current research coverage.");
  });

  it("blocks publication when role-decision inputs fail snapshot reconciliation", () => {
    const result = verifyRecommendation(recommendation, {
      roleDecisionSnapshot: {
        isValid: false,
        errors: ["Evidence readiness projection input does not match the verification snapshot."],
        warnings: []
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Evidence readiness projection input does not match the verification snapshot.");
  });

  it("blocks a squad without five recent public-news articles", () => {
    const result = verifyRecommendation({
      ...recommendation,
      publicNewsArticles: recommendation.publicNewsArticles?.slice(0, 4)
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Selected squad requires 5 distinct public-news articles published within 14 days of selection; found 4."
    );
  });

  it("blocks a captain selected below the declared raw-EV maximum", () => {
    const captaincy = recommendation.decisionEvaluations?.find((item) => item.decisionType === "captaincy");
    const result = verifyRecommendation({
      ...recommendation,
      decisionEvaluations: recommendation.decisionEvaluations?.map((item) => item !== captaincy ? item : {
        ...item,
        candidateScores: item.candidateScores.map((candidate) => ({
          ...candidate,
          rawExpectedPoints: candidate.candidateId === "player:8" ? 5.5 : 5.8,
          objectiveScore: candidate.candidateId === "player:8" ? 5.5 : 5.8
        }))
      })
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Decision dec:captaincy selected player:8 with score 5.5, below the declared-objective maximum 5.8."
    );
  });

  it("rejects an unquantified explicit override", () => {
    const overridden = structuredClone(recommendation);
    const captaincy = overridden.decisionEvaluations!.find((item) => item.decisionType === "captaincy")!;
    captaincy.candidateScores = captaincy.candidateScores.map((candidate) => ({
      ...candidate,
      rawExpectedPoints: candidate.candidateId === "player:8" ? 5.5 : 5.8,
      objectiveScore: candidate.candidateId === "player:8" ? 5.5 : 5.8
    }));
    captaincy.selectedBy = "explicit_override";
    captaincy.overrideReason = "Prefer the midfielder despite the lower declared score.";
    captaincy.objectiveLeaderCandidateId = captaincy.candidateScores.find((candidate) => candidate.objectiveScore === 5.8)!.candidateId;
    captaincy.comparisonStatus = "CLEAR";
    captaincy.nearTieCandidateIds = [captaincy.objectiveLeaderCandidateId];

    const result = verifyRecommendation(overridden);

    expect(result.publicationGate.publicationStatus).toBe("invalid");
    expect(result.errors).toContain(
      "Decision dec:captaincy explicit override must quantify the objective-score tradeoff."
    );
  });

  it("accepts a quantified explicit override", () => {
    const overridden = structuredClone(recommendation);
    const captaincy = overridden.decisionEvaluations!.find((item) => item.decisionType === "captaincy")!;
    captaincy.candidateScores = captaincy.candidateScores.map((candidate) => ({
      ...candidate,
      rawExpectedPoints: candidate.candidateId === "player:8" ? 5.5 : 5.8,
      objectiveScore: candidate.candidateId === "player:8" ? 5.5 : 5.8
    }));
    captaincy.selectedBy = "explicit_override";
    captaincy.overrideReason = "Current role evidence supports accepting the measured objective tradeoff.";
    captaincy.overrideTradeoff = { objectiveScoreDelta: 0.3, evidenceIds: ["fact:test"] };
    captaincy.objectiveLeaderCandidateId = captaincy.candidateScores.find((candidate) => candidate.objectiveScore === 5.8)!.candidateId;
    captaincy.comparisonStatus = "CLEAR";
    captaincy.nearTieCandidateIds = [captaincy.objectiveLeaderCandidateId];
    overridden.canonicalState!.playerProjections = overridden.canonicalState!.playerProjections.map((projection) =>
      projection.playerId === 8 ? { ...projection, projectedPoints: 5.5 } :
        projection.playerId === 13 ? { ...projection, projectedPoints: 5.8 } : projection
    );
    overridden.canonicalState!.uncaptainedXIProjection = overridden.pickTeam.startingXI.reduce((sum, playerId) =>
      sum + overridden.canonicalState!.playerProjections.find((projection) => projection.playerId === playerId)!.projectedPoints, 0
    );
    overridden.pickTeam.projectedPoints = overridden.canonicalState!.uncaptainedXIProjection;
    overridden.canonicalState!.captainMarginalProjection = 5.5;
    overridden.canonicalState!.captainedTeamProjection = overridden.canonicalState!.uncaptainedXIProjection + 5.5;

    expect(verifyRecommendation(overridden).errors).toEqual([]);
  });

  it("rejects one-candidate optimized evaluations and orphaned structural counterfactuals", () => {
    const invalid = structuredClone(recommendation);
    const squad = invalid.decisionEvaluations!.find((item) => item.decisionType === "squad")!;
    squad.candidateScores = squad.candidateScores.slice(0, 1);
    const structure = invalid.decisionEvaluations!.find((item) => item.decisionType === "structure")!;
    structure.candidateScores = structure.candidateScores.filter((candidate) => candidate.candidateId !== "test:premium:gw1:1");

    const result = verifyRecommendation(invalid);

    expect(result.errors).toContain("Optimized decision dec:squad must contain at least two meaningful eligible candidates.");
    expect(result.errors).toContain("Material structural counterfactual test:premium:gw1:1 is not persisted in dec:structure.candidateScores.");
  });

  it("rejects a selected structural candidate that does not equal the published squad", () => {
    const invalid = structuredClone(recommendation);
    const structure = invalid.decisionEvaluations!.find((item) => item.decisionType === "structure")!;
    const selected = structure.candidateScores.find((candidate) => candidate.candidateId === structure.selectedCandidateId)!;
    selected.state!.playerIds = selected.state!.playerIds.map((id) => id === 15 ? 99 : id);

    const result = verifyRecommendation(invalid);

    expect(result.errors).toContain(
      "Decision dec:structure selected structural candidate structure:balanced, but its player composition does not equal the published squad."
    );
  });

  it("rejects undecomposed non-raw objective scores", () => {
    const invalid = structuredClone(recommendation);
    invalid.decisionPolicy!.objectiveMetric = "structural_utility";
    for (const evaluation of invalid.decisionEvaluations!) {
      evaluation.objectiveMetric = "structural_utility";
      evaluation.candidateScores = evaluation.candidateScores.map((candidate) => ({
        ...candidate,
        scoreComponents: [{ name: "structural objective", value: candidate.objectiveScore, evidenceIds: ["fact:test"] }]
      }));
    }
    const structure = invalid.decisionEvaluations!.find((item) => item.decisionType === "structure")!;
    delete structure.candidateScores[0]!.scoreComponents;

    const result = verifyRecommendation(invalid);

    expect(result.errors).toContain("Decision dec:structure candidate structure:balanced does not decompose its structural_utility score.");
  });

  it("rejects auditable prose when factualClaims is empty", () => {
    const result = verifyRecommendation({ ...recommendation, factualClaims: [] });

    expect(result.publicationGate.publicationStatus).toBe("invalid");
    expect(result.errors.some((error) => error.includes("absent from factualClaims"))).toBe(true);
  });

  it("distinguishes source availability from usable evidence coverage", () => {
    const invalid = structuredClone(recommendation);
    const betting = invalid.evidenceSnapshot!.components.find((component) => component.kind === "betting_markets")!;
    delete betting.coverageStatus;

    const result = verifyRecommendation(invalid);

    expect(result.errors).toContain(
      "Evidence snapshot component betting_markets must distinguish source availability from usable coverage."
    );

    betting.coverageStatus = "no_matching_rows";
    betting.matchedRecordCount = 0;
    expect(verifyRecommendation(invalid).publicationGate.validators.find((item) => item.validator === "snapshot")?.status).toBe("pass");
  });

  it("requires risk coverage for Okafor at the material start-probability threshold", () => {
    const invalid = structuredClone(recommendation);
    invalid.squadBefore.players.find((player) => player.id === 8)!.name = "Noah Okafor";
    invalid.canonicalState!.playerProjections.find((projection) => projection.playerId === 8)!.startProbability = 0.78;
    invalid.materialRiskPolicy = { startProbabilityThreshold: 0.78, selectedStarterCoverage: [] };
    const risk = "Noah Okafor models at 78 percent to start.";
    invalid.risks = [risk];
    invalid.factualClaims!.push({
      id: "claim:okafor-start-risk",
      decisionId: "dec:starting-xi",
      snapshotId: invalid.evidenceSnapshot!.snapshotId,
      kind: "start_probability",
      statement: risk,
      candidateId: startingXiCandidateId(invalid.pickTeam.startingXI),
      subjectId: "8",
      value: 0.78,
      dependencyIds: ["fact:test"],
      validation: { status: "validated", method: "canonical start-probability comparison" }
    });

    const result = verifyRecommendation(invalid);

    expect(result.publicationGate.publicationStatus).toBe("invalid");
    expect(result.errors).toContain(
      "Material starter risk for player 8 requires exactly one change condition, explicit coverage reason, or risk waiver; found 0."
    );

    const changeCondition = "Bench Noah Okafor if unavailable.";
    invalid.whatWouldChangeMyMind = [changeCondition];
    invalid.materialRiskPolicy.selectedStarterCoverage = [{
      playerId: 8,
      resolution: "change_condition",
      statement: changeCondition
    }];
    expect(verifyRecommendation(invalid).publicationGate.validators.find((item) => item.validator === "risk-coverage")?.status).toBe("pass");

    invalid.materialRiskPolicy.selectedStarterCoverage.push({
      playerId: 8,
      resolution: "risk_waiver",
      statement: risk
    });
    expect(verifyRecommendation(invalid).errors).toContain(
      "Material starter risk for player 8 requires exactly one change condition, explicit coverage reason, or risk waiver; found 2."
    );
  });

  it("blocks a false structured club-count explanation", () => {
    const statement = "This route produces triple club representation.";
    const result = verifyRecommendation({
      ...recommendation,
      recommendedAction: { ...recommendation.recommendedAction, explanation: statement },
      factualClaims: [{
        id: "claim:club-count",
        decisionId: "dec:squad",
        snapshotId: recommendation.evidenceSnapshot!.snapshotId,
        kind: "club_count",
        statement,
        candidateId: null,
        subjectId: "1",
        value: 3,
        dependencyIds: ["fact:test"],
        validation: { status: "validated", method: "canonical club-count comparison" }
      }]
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Factual claim claim:club-count states club count 3; canonical count is 2.");
  });

  it("fails invalid captaincy", () => {
    const result = verifyRecommendation({
      ...recommendation,
      captaincy: {
        ...recommendation.captaincy,
        viceCaptainPlayerId: recommendation.captaincy.captainPlayerId
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Captain and vice-captain must be different players.");
  });

  it("fails invalid transfer cost", () => {
    const result = verifyRecommendation({
      ...recommendation,
      recommendedAction: {
        ...recommendation.recommendedAction,
        transfers: [{ sellPlayerId: 7, buyPlayerId: 99 }],
        transferCost: 4
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Transfer cost must be 0, received 4.");
  });

  it("validates transfer membership against the selected post-transfer squad", () => {
    const players = recommendation.squadBefore.players.map((player) => player.id === 7
      ? { ...player, id: 99, name: "Replacement Defender" }
      : player);
    const transferred = withDecisionConsistency({
      ...recommendation,
      claimLedger: testClaimLedger(),
      squadBefore: { ...recommendation.squadBefore, players },
      recommendedAction: {
        type: "transfer",
        transfers: [{ sellPlayerId: 7, buyPlayerId: 99 }],
        transferCost: 0,
        bankAfter: recommendation.squadBefore.bank,
        explanation: "Use the free transfer."
      }
    });

    expect(verifyRecommendation(transferred).errors).not.toContain(
      "Transfer sell player id 7 remains in the selected squad."
    );
    expect(verifyRecommendation(transferred).errors).not.toContain(
      "Transfer buy player id 99 is absent from the selected squad."
    );
  });

  it("rejects transfer membership that does not match the selected post-transfer squad", () => {
    const result = verifyRecommendation({
      ...recommendation,
      recommendedAction: {
        type: "transfer",
        transfers: [{ sellPlayerId: 7, buyPlayerId: 99 }],
        transferCost: 0,
        bankAfter: recommendation.squadBefore.bank,
        explanation: "Use the free transfer."
      }
    });

    expect(result.errors).toContain("Transfer sell player id 7 remains in the selected squad.");
    expect(result.errors).toContain("Transfer buy player id 99 is absent from the selected squad.");
  });

  it("fails recommendations that do not require manual execution", () => {
    const result = verifyRecommendation({
      ...recommendation,
      manualExecutionRequired: false
    } as WeeklyRecommendation);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Recommendation must require manual execution.");
  });

  it("rejects legacy recommendations without agent authorship", () => {
    const result = verifyRecommendation({
      ...recommendation,
      schemaVersion: 1,
      artifactKind: undefined,
      authorship: undefined,
      decisionContext: undefined
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Final recommendation must be a schema v2 coding-agent-authored decision artifact."
    );
  });

  it("rejects missing and orphaned decision provenance", () => {
    const missing = verifyRecommendation({
      ...recommendation,
      claimLedger: undefined,
      decisionIds: undefined
    });
    expect(missing.errors).toContain("Final recommendation must include a claim ledger and decision dependencies.");

    const ledger = testClaimLedger();
    ledger.decisions[0].factIds = ["fact:missing"];
    const orphaned = verifyRecommendation({ ...recommendation, claimLedger: ledger });
    expect(orphaned.errors).toContain("Decision dec:squad references missing fact fact:missing.");
  });

  it("rejects roll during preseason", () => {
    const result = verifyRecommendation({
      ...recommendation,
      decisionContext: {
        ...recommendation.decisionContext!,
        phase: "PRESEASON_DRAFT"
      }
    });

    expect(result.errors).toContain("Action roll is not valid during PRESEASON_DRAFT.");
  });

  it("accepts a preseason retain action without transfer charging", () => {
    const preseason = withDecisionConsistency({
      ...recommendation,
      claimLedger: testClaimLedger(),
      decisionContext: {
        ...recommendation.decisionContext!,
        phase: "PRESEASON_DRAFT"
      },
      recommendedAction: {
        ...recommendation.recommendedAction,
        type: "retain_draft"
      }
    });
    const result = verifyRecommendation(preseason);

    expect(result.isValid).toBe(true);
  });

  it("rejects transfer cost and player moves on a retained preseason draft", () => {
    const result = verifyRecommendation({
      ...recommendation,
      decisionContext: {
        ...recommendation.decisionContext!,
        phase: "PRESEASON_DRAFT"
      },
      recommendedAction: {
        ...recommendation.recommendedAction,
        type: "retain_draft",
        transfers: [{ sellPlayerId: 7, buyPlayerId: 99 }],
        transferCost: 4
      }
    });

    expect(result.errors).toContain("Preseason draft actions cannot have a transfer cost.");
    expect(result.errors).toContain("Action retain_draft cannot contain player moves.");
  });

  it("warns for provisional recommendations", () => {
    const result = verifyRecommendation({
      ...recommendation,
      deadlineStatus: "unknown",
      dataMode: "provisional"
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Deadline status is unknown.");
    expect(result.warnings).toContain(
      "Provisional recommendation: player IDs, prices, fixtures, and availability may be stale."
    );
    expect(result.warnings).toContain("Recommendation uses provisional data.");
  });
});
