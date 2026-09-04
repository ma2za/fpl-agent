import { describe, expect, it } from "vitest";
import type { FixtureHorizonReport } from "../packages/agent/src";
import { CURRENT_SQUAD } from "../config/squad";
import { fixtureProjectionContext, marketCoverageWarnings } from "./generate-recommendation";

describe("recommendation projection context", () => {
  it("identifies the frozen source gameweek for configured decisions", () => {
    expect(CURRENT_SQUAD.sourceGameweek).toBe(3 - 1);
  });

  it("maps GW1 attack and defence fixture difficulty without using longer horizons", () => {
    const report = {
      teams: [{
        teamId: 7,
        horizons: [
          { gameweeks: 1, attack: { averageDifficulty: 2.25 }, defence: { averageDifficulty: 3.75 } },
          { gameweeks: 3, attack: { averageDifficulty: 4.5 }, defence: { averageDifficulty: 1.5 } }
        ]
      }]
    } as FixtureHorizonReport;

    expect(fixtureProjectionContext(report)).toEqual({
      attackFixtureDifficultyByTeamId: { 7: 2.25 },
      defenceFixtureDifficultyByTeamId: { 7: 3.75 }
    });
  });

  it("returns empty maps when fixture evidence is unavailable", () => {
    expect(fixtureProjectionContext(null)).toEqual({
      attackFixtureDifficultyByTeamId: {},
      defenceFixtureDifficultyByTeamId: {}
    });
  });

  it("labels missing market components for likely-starting squad players", () => {
    const warnings = marketCoverageWarnings({
      features: {
        players: [
          { playerId: 1, anytimeScorerProbability: null, cleanSheetProbability: 0.35 },
          { playerId: 2, anytimeScorerProbability: null, cleanSheetProbability: null }
        ]
      },
      players: [
        { id: 1, position: "MID" },
        { id: 2, position: "GKP" },
        { id: 3, position: "FWD" }
      ],
      projections: [
        { playerId: 1, appearance: { startProbability: 0.95 } },
        { playerId: 2, appearance: { startProbability: 0.95 } },
        { playerId: 3, appearance: { startProbability: 0.8 } }
      ],
      squadPlayerIds: [1, 2, 3]
    });

    expect(warnings).toEqual([
      "Heuristic goal fallback remains active for likely-starting squad player IDs: 1.",
      "Heuristic clean-sheet fallback remains active for likely-starting squad player IDs: 2."
    ]);
  });
});
