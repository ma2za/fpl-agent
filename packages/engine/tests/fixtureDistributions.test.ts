import { describe, expect, it } from "vitest";
import { buildFixtureDistributions } from "../src";

describe("fixture distributions", () => {
  it("turns labeled FPL overall strengths into evidenced low-confidence goal states", () => {
    const [fixture] = buildFixtureDistributions({
      gameweek: 1,
      fixtures: [{ id: 7, event: 1, team_h: 1, team_a: 2 }],
      teams: [
        { id: 1, strength_overall_home: 4, strength_overall_away: 4 },
        { id: 2, strength_overall_home: 2, strength_overall_away: 2 }
      ]
    });

    expect(fixture).toMatchObject({
      fixtureId: 7,
      model: "INDEPENDENT_POISSON_FROM_EXPECTED_GOALS",
      expectedGoalsMethod: "FPL_OVERALL_STRENGTH_HEURISTIC_V1",
      confidence: "low"
    });
    expect(fixture.homeExpectedGoals).toBeGreaterThan(fixture.awayExpectedGoals);
    expect(fixture.evidenceIds).toHaveLength(3);
  });
});
