import { describe, expect, it } from "vitest";
import { buildFixtureTicker, renderFixtureTickerMarkdown } from "../src";

describe("buildFixtureTicker", () => {
  it("summarizes fixture difficulty over a horizon", () => {
    const ticker = buildFixtureTicker({
      gameweek: 1,
      horizon: 2,
      generatedAt: "2026-07-04T00:00:00.000Z",
      teams: [
        { id: 1, name: "Alpha", short_name: "ALP" },
        { id: 2, name: "Beta", short_name: "BET" }
      ],
      fixtures: [
        {
          event: 1,
          team_h: 1,
          team_a: 2,
          team_h_difficulty: 2,
          team_a_difficulty: 4,
          kickoff_time: "2026-08-15T10:00:00Z",
          finished: false
        },
        {
          event: 2,
          team_h: 2,
          team_a: 1,
          team_h_difficulty: 3,
          team_a_difficulty: 3,
          kickoff_time: "2026-08-22T10:00:00Z",
          finished: false
        }
      ]
    });

    expect(ticker.teams[0]).toMatchObject({
      teamName: "Alpha",
      fixtureCount: 2,
      blankCount: 0,
      doubleCount: 0,
      averageDifficulty: 2.5
    });
    expect(renderFixtureTickerMarkdown(ticker)).toContain("Fixture Ticker");
  });
});
