import { describe, expect, it } from "vitest";
import { buildFixtureDistributions, fitMarketExpectedGoals } from "../src";

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

  it("fits coherent market probabilities and falls back when markets are incomplete", () => {
    const market = {
      fixtureId: 7,
      homeWinProbability: 0.486,
      drawProbability: 0.26,
      awayWinProbability: 0.254,
      over25Probability: 0.456,
      under25Probability: 0.544,
      homeCleanSheetProbability: Math.exp(-1),
      awayCleanSheetProbability: Math.exp(-1.5),
      evidenceIds: ["odds:7"]
    };
    const fit = fitMarketExpectedGoals(market);
    expect(fit?.active).toBe(true);
    expect(fit?.homeExpectedGoals).toBeCloseTo(1.5, 1);
    expect(fit?.awayExpectedGoals).toBeCloseTo(1, 1);

    const [distribution] = buildFixtureDistributions({
      gameweek: 1,
      fixtures: [{ id: 7, event: 1, team_h: 1, team_a: 2 }],
      teams: [{ id: 1, strength_overall_home: 4, strength_overall_away: 4 }, { id: 2, strength_overall_home: 2, strength_overall_away: 2 }],
      marketInputs: [{ ...market, homeCleanSheetProbability: null }]
    });
    expect(distribution.expectedGoalsMethod).toBe("FPL_OVERALL_STRENGTH_HEURISTIC_V1");
  });
});
