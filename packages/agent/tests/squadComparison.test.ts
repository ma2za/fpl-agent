import { describe, expect, it } from "vitest";
import { compareSquads, renderSquadComparisonMarkdown, type WeeklyRecommendation } from "../src";

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2026-07-04T00:00:00.000Z",
  deadline: "unknown",
  deadlineStatus: "unknown",
  dataMode: "provisional",
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
    explanation: "Roll."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchOrder: [2, 6, 12, 7],
    projectedPoints: 60,
    explanation: "Pick."
  },
  captaincy: {
    captainPlayerId: 8,
    viceCaptainPlayerId: 13,
    alternatives: [],
    explanation: "Captaincy."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["No chip."],
    warnings: []
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.5,
    label: "medium",
    explanation: "Confidence."
  },
  risks: ["Risk."],
  whatWouldChangeMyMind: ["Condition."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

describe("compareSquads", () => {
  it("compares two authored recommendations", () => {
    const comparison = compareSquads({
      generatedAt: "2026-07-04T00:00:00.000Z",
      labelA: "A",
      labelB: "B",
      recommendationA: recommendation,
      recommendationB: {
        ...recommendation,
        pickTeam: {
          ...recommendation.pickTeam,
          projectedPoints: 62
        }
      }
    });

    expect(comparison.sharedPlayerIds).toHaveLength(15);
    expect(comparison.notes).toContain("B projected XI delta: +2.0.");
    expect(renderSquadComparisonMarkdown(comparison)).toContain("Squad Comparison");
  });
});
