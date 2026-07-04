import { describe, expect, it } from "vitest";
import { buildEvidencePack, renderDecisionPrompts, renderProjectionSummary } from "../src";
import type { PlayerForEngine, PlayerProjection } from "../../engine/src";

const players: PlayerForEngine[] = [
  { id: 1, name: "Goalkeeper", position: "GKP", teamId: 1, price: 5, nowCost: 50, status: "a", totalPoints: 120 },
  { id: 2, name: "Defender", position: "DEF", teamId: 1, price: 6, nowCost: 60, status: "a", totalPoints: 150 },
  { id: 3, name: "Midfielder", position: "MID", teamId: 2, price: 10, nowCost: 100, status: "a", totalPoints: 200 },
  { id: 4, name: "Forward", position: "FWD", teamId: 3, price: 12, nowCost: 120, status: "a", totalPoints: 220 }
];

const projections: PlayerProjection[] = [
  {
    playerId: 1,
    projectedPoints: 4,
    expectedMinutes: 90,
    basePointsPer90: 4,
    expectedMinutesFactor: 1,
    fixtureDifficultyFactor: 1,
    availabilityFactor: 1,
    formFactor: 1
  },
  {
    playerId: 2,
    projectedPoints: 5,
    expectedMinutes: 90,
    basePointsPer90: 5,
    expectedMinutesFactor: 1,
    fixtureDifficultyFactor: 1,
    availabilityFactor: 1,
    formFactor: 1
  },
  {
    playerId: 3,
    projectedPoints: 7,
    expectedMinutes: 90,
    basePointsPer90: 7,
    expectedMinutesFactor: 1,
    fixtureDifficultyFactor: 1,
    availabilityFactor: 1,
    formFactor: 1
  },
  {
    playerId: 4,
    projectedPoints: 8,
    expectedMinutes: 90,
    basePointsPer90: 8,
    expectedMinutesFactor: 1,
    fixtureDifficultyFactor: 1,
    availabilityFactor: 1,
    formFactor: 1
  }
];

describe("buildEvidencePack", () => {
  it("builds player pools, budget tiers, and club exposure", () => {
    const pack = buildEvidencePack({
      gameweek: 1,
      createdAt: "2026-07-04T00:00:00.000Z",
      dataMode: "provisional",
      deadline: "unknown",
      deadlineStatus: "unknown",
      manualSquadConfigured: false,
      currentSquadPlayerIds: [],
      riskProfile: {},
      notes: {
        fixtures: "",
        teamNews: "",
        setPieces: "",
        watchlist: "",
        strategy: ""
      },
      warnings: ["Fixture test warning."],
      players,
      projections,
      freeTransfers: 1,
      chipsAvailable: ["wildcard"]
    });

    expect(pack.playerPool.FWD[0].name).toBe("Forward");
    expect(pack.playerPool.MID[0].projectedPoints).toBe(7);
    expect(pack.budgetTiers.find((tier) => tier.name === "premium")?.players).toHaveLength(2);
    expect(pack.clubExposure.find((club) => club.teamId === 1)?.count).toBe(2);
    expect(renderProjectionSummary(pack)).toContain("Projection Summary");
    expect(renderDecisionPrompts(pack)).toContain("Agent Questions");
  });
});
