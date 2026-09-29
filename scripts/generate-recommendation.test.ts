import { describe, expect, it } from "vitest";
import type { FixtureHorizonReport } from "../packages/agent/src";
import { projectPlayers, type PlayerForEngine } from "../packages/engine/src";
import { engineSquad } from "../packages/engine/tests/fixtures";
import { CURRENT_SQUAD } from "../config/squad";
import { fixtureProjectionContext, marketCoverageWarnings, transferPlanningCandidates } from "./generate-recommendation";

describe("recommendation projection context", () => {
  it("identifies the frozen source gameweek for configured decisions", () => {
    expect(CURRENT_SQUAD.sourceGameweek).toBe(5);
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

  it("writes five actionable GW1 options plus the roll baseline with planning metadata", () => {
    const alternatives: PlayerForEngine[] = Array.from({ length: 5 }, (_, index) => ({
      id: 101 + index,
      name: `Alternative ${index + 1}`,
      nowCost: 50,
      price: 5,
      position: "MID",
      status: "a",
      teamId: 6 + index,
      chanceOfPlayingNextRound: 100,
      expectedPointsNext: 8 - index / 10,
      expectedPointsThis: 8 - index / 10,
      form: 5,
      minutes: 900,
      selectedByPercent: 1,
      totalPoints: 30
    }));
    const players = [...engineSquad, ...alternatives];
    const projections = projectPlayers(players);
    const candidates = transferPlanningCandidates({
      players,
      projections,
      downsideProjections: projections.map((projection) => ({
        ...projection,
        projectedPoints: projection.projectedPoints - 1
      })),
      squadPlayerIds: engineSquad.map((player) => player.id),
      freeTransfers: 1,
      bank: 1
    });

    expect(candidates).toHaveLength(6);
    expect(candidates.filter((candidate) => candidate.type === "transfer")).toHaveLength(5);
    expect(candidates.at(-1)?.type).toBe("roll");
    expect(candidates.every((candidate) => candidate.planning?.modelVersion === "0.0.26")).toBe(true);
    expect(candidates.every((candidate) => candidate.expectedGain3GW === null || candidate.type === "roll")).toBe(true);
  });
});
