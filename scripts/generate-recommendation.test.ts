import { describe, expect, it } from "vitest";
import type { FixtureHorizonReport } from "../packages/agent/src";
import { CURRENT_SQUAD } from "../config/squad";
import { fixtureProjectionContext } from "./generate-recommendation";

describe("recommendation projection context", () => {
  it("identifies the frozen source gameweek for configured decisions", () => {
    expect(CURRENT_SQUAD.sourceGameweek).toBe(1);
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
});
