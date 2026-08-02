import { describe, expect, it } from "vitest";
import {
  buildEvidencePack,
  buildStrategyEvidence,
  evaluateWeeklyStrategyQuality,
  renderSeasonStrategyTemplate,
  renderWeeklyStrategyTemplate,
  type WeeklyRecommendation,
  type WeeklyStrategy
} from "../src";

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2026-07-28T00:00:00.000Z",
  deadline: "2026-08-21T17:30:00Z",
  deadlineStatus: "open",
  dataMode: "official",
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
    explanation: "Initial squad."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchOrder: [2, 6, 12, 7],
    projectedPoints: 60,
    explanation: "Pick secure starters."
  },
  captaincy: {
    captainPlayerId: 8,
    viceCaptainPlayerId: 13,
    alternatives: [],
    explanation: "Premium attacker profile."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["Season chip posture says save chips."],
    warnings: []
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.7,
    label: "medium",
    explanation: "Strategy test confidence."
  },
  evidenceReferences: [
    { area: "squad", source: "test", reportPath: "test.md", note: "Squad evidence." },
    { area: "starting-xi", source: "test", reportPath: "test.md", note: "XI evidence." },
    { area: "shortlist", source: "test", reportPath: "test.md", note: "Shortlist evidence." },
    { area: "captaincy", source: "test", reportPath: "test.md", note: "Captaincy evidence." },
    { area: "bench", source: "test", reportPath: "test.md", note: "Bench evidence." },
    { area: "chip", source: "test", reportPath: "test.md", note: "Chip evidence." },
    { area: "risks", source: "test", reportPath: "test.md", note: "Risk evidence." },
    { area: "change-conditions", source: "test", reportPath: "test.md", note: "Change evidence." }
  ],
  risks: ["Team news risk."],
  whatWouldChangeMyMind: ["Starter news."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

const weeklyStrategy: WeeklyStrategy = {
  gameweek: 1,
  status: "agent_authored",
  riskProfile: "balanced",
  squadSource: "from_scratch",
  weeklyThesis: "Build a flexible initial structure.",
  horizons: {
    oneGameweek: "Captaincy and bench.",
    threeGameweeks: "Transfers.",
    sixGameweeks: "Structure."
  },
  transferPlan: {
    posture: "roll",
    rationale: "No transfer applies to an initial squad.",
    followsRiskProfile: true
  },
  captaincyPlan: {
    primaryProfile: "Premium attacker.",
    rationale: "Captaincy should use the premium attacker profile."
  },
  chipPlan: {
    chip: "none",
    rationale: "Save chips according to season posture.",
    referencesSeasonPosture: true
  },
  risks: ["Team news."],
  whatWouldChangeMyMind: ["Injury news."]
};

describe("strategy helpers", () => {
  it("renders season strategy template", () => {
    expect(renderSeasonStrategyTemplate()).toContain("GW1-6");
  });

  it("renders weekly strategy template from evidence", () => {
    const evidencePack = buildEvidencePack({
      gameweek: 1,
      createdAt: "2026-07-28T00:00:00.000Z",
      dataMode: "official",
      deadline: "2026-08-21T17:30:00Z",
      deadlineStatus: "open",
      competitionState: {
        phase: "TRANSFER_WINDOW",
        deadlineProximity: "early",
        activeGameweek: 1,
        nextDeadline: "2026-08-15T10:00:00Z"
      },
      manualSquadConfigured: false,
      currentSquadPlayerIds: [],
      riskProfile: { transferHits: "balanced" },
      notes: {
        fixtures: "",
        teamNews: "",
        setPieces: "",
        watchlist: "",
        strategy: "",
        strategyEvidence: ""
      },
      warnings: [],
      players: recommendation.squadBefore.players,
      projections: [{ playerId: 8, projectedPoints: 8, expectedMinutes: 90, reasons: [] }],
      freeTransfers: 1,
      chipsAvailable: ["wildcard"]
    });
    const strategyEvidence = buildStrategyEvidence({
      evidencePack,
      seasonPlanExists: true,
      weeklyStrategyExists: false
    });

    expect(renderWeeklyStrategyTemplate(strategyEvidence)).toContain("Weekly Thesis");
  });
});

describe("evaluateWeeklyStrategyQuality", () => {
  it("passes a complete weekly strategy", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy,
      recommendation,
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "balanced" }
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when weekly strategy is missing", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy: null,
      recommendation,
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "balanced" }
    });

    expect(result.errors).toContain("Weekly strategy file is required.");
  });

  it("fails when captaincy rationale is missing", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy: {
        ...weeklyStrategy,
        captaincyPlan: {
          ...weeklyStrategy.captaincyPlan,
          rationale: ""
        }
      },
      recommendation,
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "balanced" }
    });

    expect(result.errors).toContain("Weekly strategy captaincy rationale is required.");
  });

  it("fails when chip rationale does not reference season posture", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy: {
        ...weeklyStrategy,
        chipPlan: {
          ...weeklyStrategy.chipPlan,
          referencesSeasonPosture: false
        }
      },
      recommendation,
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "balanced" }
    });

    expect(result.errors).toContain("Weekly strategy chip plan must reference the season chip posture.");
  });

  it("fails when risks and change conditions are missing", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy: {
        ...weeklyStrategy,
        risks: [],
        whatWouldChangeMyMind: []
      },
      recommendation,
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "balanced" }
    });

    expect(result.errors).toContain("Weekly strategy risks are required.");
    expect(result.errors).toContain("Weekly strategy change conditions are required.");
  });

  it("warns when transfer posture contradicts conservative risk", () => {
    const result = evaluateWeeklyStrategyQuality({
      weeklyStrategy: {
        ...weeklyStrategy,
        transferPlan: {
          posture: "hit",
          rationale: "Take a hit.",
          followsRiskProfile: true
        }
      },
      recommendation: {
        ...recommendation,
        recommendedAction: {
          ...recommendation.recommendedAction,
          type: "hit",
          transfers: [{ sellPlayerId: 7, buyPlayerId: 99 }, { sellPlayerId: 12, buyPlayerId: 100 }],
          transferCost: 4
        }
      },
      seasonPlanText: "Chip Posture",
      riskProfile: { transferHits: "conservative" }
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain("Transfer hit contradicts conservative risk profile.");
  });
});
