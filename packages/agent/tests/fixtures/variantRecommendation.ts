import type { ClaimLedger, WeeklyRecommendation, WeeklyStrategy } from "../../src";

const decisionAreas = [
  "squad", "starting-xi", "shortlist", "captaincy", "bench", "chip", "risks", "change-conditions"
] as const;

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

  return {
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
      "squad", "starting-xi", "shortlist", "captaincy", "bench", "chip", "risks", "change-conditions"
    ].map((area) => ({
      area: area as WeeklyRecommendation["evidenceReferences"][number]["area"],
      source: "fixture",
      reportPath: "evidence-report.json",
      note: "Fixture-backed evidence."
    })),
    risks: ["Late availability can change the authored decision."],
    whatWouldChangeMyMind: ["Material team news before the deadline."],
    legality: { isValid: true, errors: [], warnings: [] },
    manualExecutionRequired: true
  };
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
