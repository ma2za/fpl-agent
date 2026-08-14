import {
  benchCandidateId,
  captainCandidateId,
  recommendationRationale,
  squadCandidateId,
  startingXiCandidateId,
  transferCandidateId,
  type ClaimLedger,
  type EvidenceSnapshotComponentKind,
  type PlayerPublicNewsArticle,
  type WeeklyRecommendation,
  type WeeklyStrategy
} from "../../src";

export function publicNewsArticlesFor(
  players: Array<{ id: number; name: string }>,
  selectedAt = "2026-08-01T00:00:00.000Z"
): PlayerPublicNewsArticle[] {
  const publishedAt = new Date(Date.parse(selectedAt) - 7 * 24 * 60 * 60 * 1000).toISOString();

  return players.flatMap((player) => Array.from({ length: 5 }, (_, index) => ({
    playerId: player.id,
    publisher: `Test News ${index + 1}`,
    title: `${player.name} article ${index + 1}`,
    url: `https://news-${index + 1}.example.com/players/${player.id}`,
    publishedAt,
    retrievedAt: selectedAt
  })));
}

const decisionAreas = [
  "squad", "structure", "starting-xi", "shortlist", "transfers", "captaincy", "bench", "chip", "risks", "change-conditions"
] as const;

export function withDecisionConsistency(recommendation: WeeklyRecommendation) {
  const snapshotId = `snapshot:gw${recommendation.gameweek}:test`;
  const playerIds = recommendation.squadBefore.players.map((player) => player.id);
  const pointValue = recommendation.pickTeam.projectedPoints / recommendation.pickTeam.startingXI.length;
  const teamCounts = new Map<number, number>();
  for (const player of recommendation.squadBefore.players) teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
  const clubCounts = [...teamCounts].map(([teamId, count]) => ({ teamId, count }));
  const squadCost = recommendation.squadBefore.players.reduce((sum, player) => sum + player.price, 0);
  const positions = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of recommendation.squadBefore.players) positions[player.position as keyof typeof positions] += 1;
  const playerProjections = recommendation.squadBefore.players.map((player) => ({
    playerId: player.id,
    projectedPoints: pointValue,
    startProbability: 0.9,
    appearanceProbability: 0.95
  }));
  const captainProjection = pointValue;

  recommendation.evidenceSnapshot = {
    snapshotId,
    createdAt: recommendation.createdAt,
    components: [
      "bootstrap", "fixtures", "prices", "availability", "ownership", "team_news",
      "predicted_lineups", "set_pieces", "betting_markets", "projection_model",
      "appearance_model", "manual_overrides"
    ].map((kind) => ({
      kind: kind as EvidenceSnapshotComponentKind,
      status: "available" as const,
      sourceId: `src:${kind.replaceAll("_", "-")}`,
      version: "test",
      observedAt: recommendation.createdAt,
      retrievedAt: recommendation.createdAt,
      contentHash: `hash-${kind}`,
      coverageStatus: "usable" as const,
      matchedRecordCount: null
    }))
  };
  recommendation.canonicalState = {
    snapshotId,
    floatingPointTolerance: 0.001,
    displayedProjectionScope: "uncaptained",
    squadCost,
    clubCounts,
    positionCounts: positions,
    playerProjections,
    uncaptainedXIProjection: recommendation.pickTeam.projectedPoints,
    captainMarginalProjection: captainProjection,
    captainedTeamProjection: recommendation.pickTeam.projectedPoints + captainProjection
  };
  const candidate = (candidateId: string, score = 1, state?: { playerIds: number[]; squadCost: number; clubCounts: Array<{ teamId: number; count: number }> }, metrics?: Record<string, number>) => ({
    candidateId,
    rawExpectedPoints: score,
    objectiveScore: score,
    eligible: true,
    ineligibilityReasons: [],
    lowerBound: score - 1,
    upperBound: score + 1,
    state,
    metrics
  });
  const evaluation = (
    decisionId: string,
    decisionType: NonNullable<WeeklyRecommendation["decisionEvaluations"]>[number]["decisionType"],
    selectedCandidateId: string,
    candidateScores = [candidate(selectedCandidateId)],
    objectiveMetric: "raw_expected_points" | "structural_utility" = "raw_expected_points"
  ) => ({
    decisionId,
    decisionType,
    snapshotId,
    objectiveId: objectiveMetric === "raw_expected_points" ? "test-raw-ev" : "test-structural-utility",
    objectiveMetric,
    horizon: decisionType === "squad" || decisionType === "structure" ? "structural" as const : "GW1" as const,
    candidateScores: candidateScores.map((item) => objectiveMetric === "raw_expected_points" ? item : {
      ...item,
      scoreComponents: [
        { name: "gw1 expected points term", value: item.objectiveScore - 0.5, evidenceIds: ["fact:test"] },
        { name: "horizon adjustment", value: 0.5, evidenceIds: ["fact:test"] }
      ]
    }),
    selectedCandidateId,
    selectedBy: "objective_score" as const,
    overrideReason: null,
    constraintsApplied: ["test constraints"],
    riskAdjustments: [],
    uncertainty: "test uncertainty",
    tieBreakersApplied: [],
    evidenceIds: ["fact:test"]
  });
  const squadId = squadCandidateId(playerIds);
  const alternativePlayerIds = [...playerIds.slice(0, -1), 999];
  const secondAlternativePlayerIds = [...playerIds.slice(0, -2), 998, playerIds.at(-1)!];
  const selectedState = { playerIds, squadCost, clubCounts };
  const alternativeState = { playerIds: alternativePlayerIds, squadCost, clubCounts };
  const secondAlternativeState = { playerIds: secondAlternativePlayerIds, squadCost, clubCounts };
  const alternativeXi = [...recommendation.pickTeam.startingXI.slice(0, -1), recommendation.pickTeam.benchOrder[1]!];
  const captainId = captainCandidateId(recommendation.captaincy.captainPlayerId);
  const viceId = captainCandidateId(recommendation.captaincy.viceCaptainPlayerId);
  recommendation.decisionEvaluations = [
    evaluation("dec:squad", "squad", squadId, [
      candidate(squadId, 2, selectedState),
      candidate(squadCandidateId(alternativePlayerIds), 1, alternativeState)
    ]),
    evaluation("dec:structure", "structure", "structure:balanced", [
      candidate("structure:balanced", 3, selectedState, { gw1ExpectedPoints: 60, gw1To3ExpectedPoints: 180 }),
      candidate("test:premium:gw1:1", 2, alternativeState, { gw1ExpectedPoints: 59, gw1To3ExpectedPoints: 179 }),
      candidate("test:bench:gw1:1", 1, secondAlternativeState, { gw1ExpectedPoints: 58, gw1To3ExpectedPoints: 178 })
    ], "structural_utility"),
    evaluation("dec:starting-xi", "starting_xi", startingXiCandidateId(recommendation.pickTeam.startingXI), [
      candidate(startingXiCandidateId(recommendation.pickTeam.startingXI), 2, { ...selectedState, playerIds: recommendation.pickTeam.startingXI }),
      candidate(startingXiCandidateId(alternativeXi), 1, { ...selectedState, playerIds: alternativeXi })
    ]),
    evaluation("dec:bench", "bench_order", benchCandidateId(recommendation.pickTeam.benchOrder)),
    evaluation("dec:captaincy", "captaincy", captainId, [
      candidate(captainId, captainProjection),
      candidate(viceId, captainProjection)
    ]),
    evaluation("dec:transfers", "transfers", transferCandidateId(recommendation)),
    evaluation("dec:chip", "chip", `chip:${recommendation.chip.chip}`)
  ];
  recommendation.materialRiskPolicy = { startProbabilityThreshold: 0.78, selectedStarterCoverage: [] };
  recommendation.factualClaims = recommendationRationale(recommendation).map((statement, index) => ({
    id: `claim:test:${index + 1}`,
    decisionId: "dec:squad",
    snapshotId,
    kind: "source_fact",
    statement: statement.text,
    candidateId: squadId,
    subjectId: null,
    value: statement.text,
    dependencyIds: ["fact:test"],
    validation: { status: "validated", method: "test fixture dependency" }
  }));
  if (recommendation.claimLedger) {
    recommendation.claimLedger.observations = recommendation.claimLedger.observations.map((item) => ({ ...item, snapshotId }));
    if (recommendation.claimLedger.schemaVersion === 3) {
      recommendation.claimLedger.forecasts = recommendation.claimLedger.forecasts.map((item) => ({ ...item, snapshotId }));
    }
  }
  return recommendation;
}

export function testClaimLedger(): ClaimLedger {
  return {
    schemaVersion: 3,
    sources: [{ id: "src:test", publisher: "Test Publisher", sourceType: "manual", uri: null }],
    observations: [{
      id: "obs:test", kind: "OBSERVATION", sourceId: "src:test", claim: "Test evidence is available.",
      observedAt: "2026-08-01T00:00:00.000Z", retrievedAt: "2026-08-01T00:00:00.000Z",
      reliability: 1, freshness: "fresh", value: true
    }],
    facts: [{
      id: "fact:test", kind: "DERIVED_FACT", claim: "Test evidence is available.", observationIds: ["obs:test"],
      transformationId: "tx:test"
    }],
    assumptions: [{
      id: "asm:test", kind: "ASSUMPTION", claim: "The fixture evidence is representative.", factIds: ["fact:test"],
      model: "fixture-test", modelVersion: "1"
    }],
    forecasts: [{
      id: "fcst:test", kind: "FORECAST", claim: "The test player will return 5 points.",
      model: "fixture-test", modelVersion: "1", inputFactIds: ["fact:test"],
      inputAssumptionIds: ["asm:test"], outputValue: 5, uncertainty: "plus or minus 2 points", horizon: "GW1"
    }],
    transformations: [{
      id: "tx:test", tool: "test-transform", toolVersion: "1", reportPath: "test.json",
      inputIds: ["obs:test"], outputFactIds: ["fact:test"]
    }],
    decisions: decisionAreas.map((area) => ({
      id: `dec:${area}`, kind: "DECISION", claim: `Use the test evidence for ${area}.`, area,
      factIds: ["fact:test"], assumptionIds: ["asm:test"], forecastIds: ["fcst:test"]
    }))
  };
}

const positions = [
  "GKP", "GKP",
  "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD"
] as const;

export function variantRecommendation(gameweek = 1, replacedPlayerId?: number): WeeklyRecommendation {
  const players = positions.map((position, index) => {
    const id = replacedPlayerId === index + 1 ? 100 + index : index + 1;
    return {
      id,
      name: `Variant Player ${id}`,
      position,
      teamId: (index % 8) + 1,
      price: position === "GKP" ? 4.5 : position === "DEF" ? 5 : position === "MID" ? 7 : 7.5,
      nowCost: position === "GKP" ? 45 : position === "DEF" ? 50 : position === "MID" ? 70 : 75,
      status: "a",
      minutes: 2500
    };
  });
  const ids = players.map((player) => player.id);
  const startingXI = [ids[0], ...ids.slice(2, 5), ...ids.slice(7, 11), ...ids.slice(12, 15)];

  const recommendation: WeeklyRecommendation = {
    schemaVersion: 2,
    artifactKind: "agent_decision",
    authorship: {
      kind: "coding_agent",
      agent: "variant-test-agent",
      authoredAt: "2026-08-01T00:00:00.000Z"
    },
    decisionContext: {
      phase: "TRANSFER_WINDOW",
      deadlineProximity: "early",
      activeGameweek: gameweek,
      nextDeadline: "2026-08-15T10:00:00.000Z"
    },
    claimLedger: testClaimLedger(),
    decisionIds: decisionAreas.map((area) => `dec:${area}`),
    gameweek,
    createdAt: "2026-08-01T00:00:00.000Z",
    deadline: "2026-08-15T10:00:00.000Z",
    deadlineStatus: "open",
    dataMode: "official",
    squadBefore: {
      players,
      bank: 1,
      freeTransfers: 1,
      chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"]
    },
    recommendedAction: {
      type: "roll",
      transfers: [],
      transferCost: 0,
      bankAfter: 1,
      explanation: "Keep the authored structure unchanged."
    },
    pickTeam: {
      formation: "3-4-3",
      startingXI,
      benchOrder: [ids[1], ids[5], ids[6], ids[11]],
      projectedPoints: 60,
      explanation: "Projected points exclude captaincy."
    },
    captaincy: {
      captainPlayerId: ids[7],
      viceCaptainPlayerId: ids[12],
      alternatives: [],
      explanation: "Captaincy follows the authored weekly thesis."
    },
    chip: {
      chip: "none",
      confidence: "high",
      expectedGain: 0,
      reasons: ["No chip clears the authored threshold."],
      warnings: []
    },
    topTransferCandidates: [],
    confidence: {
      score: 0.6,
      label: "medium",
      explanation: "Evidence coverage supports medium confidence."
    },
    decisionAnalysis: {
      summary: "Authored fixture variant with explicit comparisons.",
      squadStructure: ["Balanced spending across the XI.", "Playable cover remains on the bench."],
      structureComparisons: [
        {
          selectedStructure: "Balanced",
          rejectedStructure: "Premium-heavy",
          counterfactualCandidateIds: ["test:premium:gw1:1"],
          whySelected: ["Retains coverage across positions."],
          whyRejected: ["Concentrates too much budget."],
          evidence: ["evidence-report.json"]
        },
        {
          selectedStructure: "Balanced",
          rejectedStructure: "Bench-heavy",
          counterfactualCandidateIds: ["test:bench:gw1:1"],
          whySelected: ["Keeps more budget in the XI."],
          whyRejected: ["Overfunds substitutes."],
          evidence: ["risk-report.json"]
        }
      ],
      playerDecisions: players.map((player) => ({
        playerId: player.id,
        role: startingXI.includes(player.id) ? "starter" : "bench",
        whyPicked: ["Fits the authored structure.", "Has an explicit role in the squad."],
        comparedAgainst: [{ name: `Alternative to ${player.name}`, whyNot: ["Does not fit this authored structure."] }],
        evidence: ["evidence-report.json"]
      })),
      captaincy: {
        captainPlayerId: ids[7],
        whyCaptain: ["Fits the weekly captain profile.", "Starts in the authored XI."],
        comparedAgainst: [{ playerId: ids[12], name: players[12].name, whyNot: ["Retained as vice-captain."] }],
        evidence: ["evidence-report.json"]
      },
      keyOmissions: [
        {
          name: "Omitted Premium",
          whyOmitted: ["Does not fit this structure."],
          wouldReconsiderIf: ["Budget allocation changes."],
          evidence: ["evidence-report.json"]
        },
        {
          name: "Omitted Enabler",
          whyOmitted: ["Role confidence is insufficient."],
          wouldReconsiderIf: ["Role evidence improves."],
          evidence: ["minutes-risk-report.json"]
        }
      ]
    },
    evidenceReferences: [
      "squad", "structure", "starting-xi", "shortlist", "captaincy", "bench", "chip", "risks", "change-conditions"
    ].map((area) => ({
      area: area as WeeklyRecommendation["evidenceReferences"][number]["area"],
      source: "fixture",
      reportPath: "evidence-report.json",
      note: "Fixture-backed evidence."
    })),
    publicNewsArticles: publicNewsArticlesFor(players),
    risks: ["Late availability can change the authored decision."],
    whatWouldChangeMyMind: ["Material team news before the deadline."],
    legality: { isValid: true, errors: [], warnings: [] },
    manualExecutionRequired: true
  };

  return withDecisionConsistency(recommendation);
}

export function variantWeeklyStrategy(gameweek = 1): WeeklyStrategy {
  return {
    gameweek,
    status: "agent_authored",
    riskProfile: "balanced",
    squadSource: "from_scratch",
    weeklyThesis: "Compare authored structures without delegating the final choice.",
    horizons: {
      oneGameweek: "Prioritize immediate certainty.",
      threeGameweeks: "Preserve structural flexibility.",
      sixGameweeks: "Avoid unnecessary commitments."
    },
    transferPlan: {
      posture: "roll",
      rationale: "The fixture variants use a roll baseline.",
      followsRiskProfile: true
    },
    captaincyPlan: {
      primaryProfile: "Secure starter",
      rationale: "Use the authored captain profile."
    },
    chipPlan: {
      chip: "none",
      rationale: "Preserve chips according to season posture.",
      referencesSeasonPosture: true
    },
    risks: ["Late news can change the comparison."],
    whatWouldChangeMyMind: ["Material availability evidence."]
  };
}
