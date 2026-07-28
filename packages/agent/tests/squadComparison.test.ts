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
    const alternate: WeeklyRecommendation = {
      ...recommendation,
      squadBefore: {
        ...recommendation.squadBefore,
        bank: 0,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 15
            ? { id: 16, name: "Forward 4", position: "FWD", teamId: 9, price: 7.5, nowCost: 75, status: "a", minutes: 1400 }
            : player
        )
      },
      pickTeam: {
        ...recommendation.pickTeam,
        projectedPoints: 62,
        startingXI: recommendation.pickTeam.startingXI.map((playerId) => playerId === 15 ? 16 : playerId)
      }
    };
    const comparison = compareSquads({
      generatedAt: "2026-07-04T00:00:00.000Z",
      labelA: "A",
      labelB: "B",
      recommendationA: recommendation,
      recommendationB: alternate
    });

    expect(comparison.sharedPlayerIds).toHaveLength(14);
    expect(comparison.positionChanges.FWD.onlyAPlayerIds).toEqual([15]);
    expect(comparison.positionChanges.FWD.onlyBPlayerIds).toEqual([16]);
    expect(comparison.summary.budgetDelta).toBe(1);
    expect(comparison.summary.projectedPointsDelta).toBe(2);
    expect(comparison.b.riskSummary.medium).toBeGreaterThan(0);
    expect(comparison.notes).toContain("B projected XI delta: +2.0.");
    expect(renderSquadComparisonMarkdown(comparison)).toContain("Position Changes");
    expect(renderSquadComparisonMarkdown(comparison)).toContain("Risk Summary");
  });
});
